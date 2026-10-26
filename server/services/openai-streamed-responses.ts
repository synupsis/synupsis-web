import type OpenAI from 'openai';
import type {
  Response,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';

/**
 * Runs OpenAI responses as direct streamed calls instead of background mode,
 * whose queue can hold requests for hours. The stream keeps running in this
 * server process after the start call returns its id; polls then read the
 * result from memory, the way they would retrieve a background response.
 */

export type StreamedResponse = Pick<Response, 'id' | 'status' | 'error' | 'incomplete_details'> & {
  output_text: string;
};

type StreamedEntry = { response: StreamedResponse; finishedAt: number | null };

// A finished response stays readable long enough for the next polls to collect it.
const FINISHED_RESPONSE_TTL_MS = 60 * 60 * 1000;
const STREAM_TIMEOUT_MS = 30 * 60 * 1000;

const streamedResponses = new Map<string, StreamedEntry>();

export async function startStreamedResponse(
  client: OpenAI,
  params: Omit<ResponseCreateParamsStreaming, 'stream' | 'background'>,
): Promise<{ id: string; status: string }> {
  forgetExpiredResponses();
  const stream = await client.responses.create({ ...params, stream: true }, { timeout: STREAM_TIMEOUT_MS });

  return await new Promise((resolve, reject) => {
    let responseId: string | null = null;
    const finish = (response: StreamedResponse) => {
      streamedResponses.set(response.id, { response, finishedAt: Date.now() });
    };

    void (async () => {
      try {
        for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
          if (event.type === 'response.created' && !responseId) {
            responseId = event.response.id;
            streamedResponses.set(responseId, { response: toStreamedResponse(event.response), finishedAt: null });
            resolve({ id: responseId, status: 'in_progress' });
          } else if (event.type === 'response.completed' || event.type === 'response.failed' || event.type === 'response.incomplete') {
            finish(toStreamedResponse(event.response));
          } else if (event.type === 'error' && responseId) {
            finish(failedResponse(responseId, event.message));
          }
        }
        // A stream that closes without a final event leaves nothing to wait for.
        if (responseId && streamedResponses.get(responseId)?.finishedAt === null) {
          finish(failedResponse(responseId, 'The OpenAI stream ended before the response finished.'));
        }
        if (!responseId) reject(new Error('The OpenAI stream ended before the response was created.'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (responseId) finish(failedResponse(responseId, message));
        else reject(error);
      }
    })();
  });
}

/**
 * Reads a response streamed by this process; one it does not know (started
 * before a restart, in background mode, or by another server process) is
 * retrieved from OpenAI.
 */
export async function retrieveStreamedResponse(client: OpenAI, responseId: string): Promise<StreamedResponse> {
  const entry = streamedResponses.get(responseId);
  if (entry) return entry.response;
  let response: Response;
  try {
    response = await client.responses.retrieve(responseId);
  } catch (error) {
    // OpenAI cannot return a response still streaming to another process: that
    // process collects it. One whose stream died expires with its job.
    if ((error as { status?: number }).status === 404) {
      return { id: responseId, status: 'in_progress', error: null, incomplete_details: null, output_text: '' };
    }
    throw error;
  }
  return {
    id: response.id,
    status: response.status,
    error: response.error,
    incomplete_details: response.incomplete_details,
    output_text: response.output_text,
  };
}

function toStreamedResponse(response: Response): StreamedResponse {
  // Stream events carry the output items but not the SDK's output_text helper.
  const outputText = response.output
    .flatMap(item => item.type === 'message' ? item.content : [])
    .map(content => content.type === 'output_text' ? content.text : '')
    .join('');
  return {
    id: response.id,
    status: response.status,
    error: response.error,
    incomplete_details: response.incomplete_details,
    output_text: outputText,
  };
}

function failedResponse(id: string, message: string): StreamedResponse {
  return {
    id,
    status: 'failed',
    error: { code: 'server_error', message },
    incomplete_details: null,
    output_text: '',
  };
}

function forgetExpiredResponses() {
  const now = Date.now();
  for (const [id, entry] of streamedResponses) {
    if (entry.finishedAt !== null && now - entry.finishedAt > FINISHED_RESPONSE_TTL_MS) streamedResponses.delete(id);
  }
}
