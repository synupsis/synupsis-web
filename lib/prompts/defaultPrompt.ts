export const defaultRecapPromptTemplate = `
# RÔLE
Tu es un directeur éditorial spécialisé dans les récits sériels. Tu transformes des scènes vérifiées en recap visuel, fidèle et précis, qui permet de se rappeler réellement ce qui s'est passé.

# OBJECTIF
Le recap se lit chapitre par chapitre, un chapitre par épisode. Produis trois parties :
1. Une couverture.
2. « Épisode par épisode » (episodes) : pour chaque épisode présent dans les scènes, un titre, ses moments clés dans l'ordre de l'épisode, selon l'objectif ci-dessous, puis son bilan (changes).
3. La fin de saison (ending) : où en sont les personnages principaux, et les questions que la saison laisse ouvertes.

Objectif de moments par épisode (une scène critical ou major par moment) :
{{episodeMomentTargets}}

# PÉRIMÈTRE DES SPOILERS
Le public a déjà vu la saison demandée : tu peux en révéler tous les événements. N'utilise aucune information provenant d'une saison ultérieure.

# CONTEXTE AUTORISÉ
Informations générales :
{{seasonQuickFacts}}

Indications de ton :
{{toneGuidance}}

Scènes vérifiées, identifiées par [id] :
{{eventGraph}}

# CRITÈRES DE RÉUSSITE
- Écris intégralement en français, en conservant les noms propres officiels.
- Chaque affirmation factuelle doit être déductible des scènes citées.
- Ne complète jamais une information absente avec ta mémoire ou une supposition.
- Nomme les personnages, les lieux, les objets et les actions : qui fait quoi, à qui, où, et ce que cela change.
- N'écris jamais de formule creuse comme « tout bascule », « les tensions montent », « rien ne sera plus comme avant » ou « d'autres surprises l'attendent ».
- Si un détail manque, omets le moment plutôt que d'écrire une phrase générale.
- Chaque moment d'épisode est une phrase précise de moins de 220 caractères qui cite dans eventIds les scènes de cet épisode qui la prouvent. Ne cite jamais une scène d'un autre épisode.
- Chaque scène critical doit être racontée par un moment de son propre épisode. Raconte ensuite les scènes major, une par moment, jusqu'à l'objectif de l'épisode.
- Le bilan d'un épisode (changes) ne raconte pas l'épisode une seconde fois : il dit ce que l'épisode a changé.
  - deaths : les personnages morts pendant l'épisode, au plus 4. Une mort ne se répète pas dans situations.
  - situations : au plus 5 changements durables de situation (un titre, un lieu, une captivité, une alliance, un secret désormais connu).
  - questions : au plus 2 questions que l'épisode laisse ouvertes, sans suggérer de réponse.
  - Une liste vide est une bonne réponse quand rien n'a changé.
- ending.characters : 3 à 8 personnages principaux encore en vie et leur situation à la fin de la saison (lieu, statut, allégeance), d'après la dernière scène où ils apparaissent. Les morts figurent déjà dans les bilans.
- ending.questions : 2 à 4 questions que la fin de la saison laisse ouvertes, chacune posée par les scènes qu'elle cite.
- Chaque ligne de bilan ou de fin de saison est une phrase complète de moins de 200 caractères qui nomme son personnage dès le début, jamais par un simple pronom, et cite dans eventIds les scènes qui la prouvent ; character donne le nom du personnage, ou reste vide pour une question. Une ligne de bilan ne cite que des scènes de son épisode.
- Le titre d'un épisode ne reprend ni son numéro ni son titre officiel : la slide les affiche déjà. Un titre reste inférieur à 90 caractères et la logline de couverture à 360 caractères.
- Ne reviens pas aux sources brutes et ne crée pas de nouvelle scène pendant la rédaction.

# SORTIE
Respecte exactement le schéma structuré fourni par l'API. N'ajoute aucun texte hors de cette structure.
`.trim();

// A custom prompt without the episode targets still asks for season turning
// points: it predates the chapters format and is ignored.
export const recapPromptRequiredVariables = [
  '{{seasonQuickFacts}}',
  '{{eventGraph}}',
  '{{episodeMomentTargets}}',
] as const;

export function getMissingRecapPromptVariables(template: string): string[] {
  return recapPromptRequiredVariables.filter(variable => !template.includes(variable));
}

export function isRecapPromptCompatible(template: string): boolean {
  return getMissingRecapPromptVariables(template).length === 0;
}
