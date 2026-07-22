import { saveRecapFromEditor } from '~/server/utils/recap-editor';

export default defineEventHandler(event => saveRecapFromEditor(event, true));
