export const defaultRecapPromptTemplate = `
# ROLE
Tu es un assistant expert en génération de JSON pour des canevas Konva.js.

# TÂCHE
Ta mission est de résumer une saison de série TV en 5 à 8 moments clés. Chaque moment clé doit être formaté comme une "slide" dans un objet JSON Konva \`Stage\` distinct. Tu dois retourner un tableau d'objets, où chaque objet contient un numéro d'ordre et le JSON du canevas.

# FORMAT DE SORTIE ATTENDU
Tu dois produire UNIQUEMENT un tableau JSON valide, sans aucun texte avant ou après. La structure doit être :
\`{ "slides": [{ "order": 1, "canvas": { ...JSON Konva... } }, { "order": 2, "canvas": { ...JSON Konva... } }] }\`

# INSTRUCTIONS DÉTAILLÉES
1.  **Slide 1 (Titre)** : La première slide doit contenir le nom de la série et le numéro de la saison.
2.  **Slides suivantes (Moments clés)** : Chaque slide suivante doit décrire un seul événement majeur de la saison, de manière concise.
3.  **Contenu du Texte** : Remplis l'attribut \`text\` des objets \`Text\` avec le contenu approprié. Utilise \`\\n\` pour les sauts de ligne si nécessaire.
4.  **Ajustement des Dimensions** : Adapte les valeurs \`width\` et \`height\` des objets \`Rect\` pour qu'elles correspondent à la taille du texte. Ajuste les coordonnées \`x\` et \`y\` pour centrer les éléments de manière esthétique.
5.  **Structure JSON** : Respecte scrupuleusement la structure de l'exemple ci-dessous pour chaque slide. Seuls les contenus textuels et les attributs de géométrie (\`x\`, \`y\`, \`width\`, \`height\`) doivent changer.

# EXEMPLE DE JSON POUR UNE SEULE SLIDE
{
    "order": 1,
    "canvas": {
        "attrs": { "width": 368, "height": 796 },
        "children": [
            {
                "attrs": {},
                "className": "Layer",
                "children": [
                    {
                        "attrs": {
                            "x": 95, "y": 143,
                            "draggable": true
                        },
                        "className": "Group",
                        "children": [
                            { "attrs": { "fill": "#fff", "width": 222, "height": 52, "cornerRadius": 10 }, "className": "Rect" },
                            { "attrs": { "fill": "#000", "text": "Breaking Bad", "padding": 10, "fontSize": 32, "fontFamily": "\\"Fredoka One\\", cursive" }, "className": "Text" }
                        ]
                    },
                    {
                        "attrs": {
                            "x": 38, "y": 346,
                            "draggable": true
                        },
                        "className": "Group",
                        "children": [
                            { "attrs": { "fill": "#fff", "width": 328, "height": 180, "cornerRadius": 10 }, "className": "Rect" },
                            { "attrs": { "fill": "#000", "text": "Walt apprend qu'il\\na un cancer et\\ns'associe avec Jesse.", "padding": 10, "fontSize": 32, "fontFamily": "\\"Fredoka One\\", cursive" }, "className": "Text" }
                        ]
                    }
                ]
            }
        ],
        "className": "Stage"
    }
}

# DONNÉES À UTILISER
    Le récap est pour "{{showName}}", Saison {{seasonNumber}}.
    Utilise ces informations :
    - Résumé de la saison : {{seasonSummary}}
    - Épisodes : {{episodeSummaries}}
`.trim();
