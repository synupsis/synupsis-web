import { legalContact, type LocalizedLegalDocument } from '~/lib/legal/document';

const { email } = legalContact;

export const privacyPolicy: LocalizedLegalDocument = {
  fr: {
    title: 'Politique de confidentialité',
    intro: 'Cette page explique quelles données Synupsis enregistre, pourquoi, avec qui elles sont partagées et comment exercer vos droits.',
    sections: [
      {
        title: 'Les données enregistrées',
        paragraphs: ['Vous pouvez parcourir les séries et regarder les récaps publiés sans compte. Avec un compte, Synupsis enregistre :'],
        items: [
          'Votre compte : adresse e-mail, nom d’utilisateur, mot de passe (jamais stocké en clair), avatar si vous en ajoutez un, langue d’affichage et langues des récaps.',
          'Votre suivi : les séries de votre bibliothèque, l’épisode où vous en êtes, le réglage du bouclier anti-spoil, les récaps que vous avez débloqués ou regardés et votre avancée dans chacun.',
          'Vos tickets et vos points.',
          'Vos contributions : commentaires, mentions « j’aime », signalements et suggestions de correction.',
        ],
      },
      {
        title: 'Ce qui est visible par les autres',
        paragraphs: [
          'Vos commentaires et vos suggestions s’affichent avec votre nom d’utilisateur et votre avatar. Votre adresse e-mail, votre bibliothèque et votre suivi ne sont jamais affichés publiquement.',
        ],
      },
      {
        title: 'Pourquoi',
        items: [
          'Faire fonctionner votre compte et les fonctions que vous utilisez (bibliothèque, anti-spoil, tickets, commentaires) : c’est nécessaire au service que vous demandez.',
          'Modérer les commentaires et les suggestions, et protéger le site contre les abus : c’est notre intérêt légitime.',
        ],
        paragraphs: [
          'Synupsis n’affiche pas de publicité, ne mesure pas l’audience avec un outil tiers et ne vend aucune donnée.',
        ],
      },
      {
        title: 'Avec qui elles sont partagées',
        paragraphs: ['Vos données passent uniquement par les prestataires qui font tourner le site :'],
        items: [
          'Supabase : base de données, comptes et stockage des avatars.',
          'Render : hébergement du site.',
        ],
      },
      {
        title: 'Services tiers chargés par votre navigateur',
        paragraphs: [
          'Pour afficher les pages, votre navigateur contacte directement certains services, qui reçoivent alors votre adresse IP : Google Fonts pour les polices, TMDB et TVmaze pour une partie des images. Les images Trakt passent par notre serveur.',
          'Les récaps sont générés par OpenAI à partir de textes publics sur les séries. Aucune donnée vous concernant ne lui est transmise.',
        ],
      },
      {
        title: 'Transferts hors de l’Union européenne',
        paragraphs: [
          'Certains de ces prestataires sont établis aux États-Unis. Lorsque des données y sont transférées, ces transferts s’appuient sur les garanties prévues par le RGPD, comme les clauses contractuelles types de la Commission européenne.',
        ],
      },
      {
        title: 'Durée de conservation',
        paragraphs: [
          'Vos données sont conservées tant que votre compte existe. Quand votre compte est supprimé, votre bibliothèque, votre suivi, vos tickets, vos commentaires et vos suggestions sont supprimés avec lui.',
        ],
      },
      {
        title: 'Cookies et stockage local',
        paragraphs: [
          'Synupsis utilise uniquement des cookies nécessaires : ceux qui gardent votre session ouverte. Le site enregistre aussi dans votre navigateur ce qu’il faut pour fonctionner hors ligne une fois installé. Comme ces éléments sont indispensables, ils ne demandent pas de consentement.',
        ],
      },
      {
        title: 'Vos droits',
        paragraphs: [
          `Vous pouvez accéder à vos données, les corriger, les supprimer, en demander une copie ou vous opposer à un traitement. Votre avatar et vos langues se modifient depuis votre profil ; pour le reste, et pour supprimer votre compte, écrivez à ${email}. Nous répondons dans un délai d’un mois.`,
          'Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (cnil.fr).',
        ],
      },
      {
        title: 'Modifications',
        paragraphs: [
          'Nous mettrons cette page à jour si la façon dont Synupsis utilise vos données change. La date en haut de la page indique la dernière modification.',
        ],
      },
    ],
  },
  en: {
    title: 'Privacy policy',
    intro: 'This page explains what data Synupsis stores, why, who it is shared with and how to exercise your rights.',
    sections: [
      {
        title: 'What we store',
        paragraphs: ['You can browse shows and watch published recaps without an account. With an account, Synupsis stores:'],
        items: [
          'Your account: email address, username, password (never stored in plain text), avatar if you add one, display language and recap languages.',
          'Your tracking: the shows in your library, the episode you are on, your spoiler shield setting, the recaps you unlocked or watched and how far you got in each.',
          'Your tickets and points.',
          'Your contributions: comments, likes, reports and correction suggestions.',
        ],
      },
      {
        title: 'What others can see',
        paragraphs: [
          'Your comments and suggestions are shown with your username and avatar. Your email address, library and tracking are never shown publicly.',
        ],
      },
      {
        title: 'Why',
        items: [
          'To run your account and the features you use (library, spoiler shield, tickets, comments): this is necessary for the service you ask for.',
          'To moderate comments and suggestions, and protect the site from abuse: this is our legitimate interest.',
        ],
        paragraphs: [
          'Synupsis shows no ads, uses no third-party analytics and sells no data.',
        ],
      },
      {
        title: 'Who it is shared with',
        paragraphs: ['Your data only goes through the providers that run the site:'],
        items: [
          'Supabase: database, accounts and avatar storage.',
          'Render: website hosting.',
        ],
      },
      {
        title: 'Third-party services loaded by your browser',
        paragraphs: [
          'To display pages, your browser contacts some services directly, which then receive your IP address: Google Fonts for typefaces, TMDB and TVmaze for some images. Trakt images go through our server.',
          'Recaps are generated by OpenAI from public texts about the shows. No data about you is sent to it.',
        ],
      },
      {
        title: 'Transfers outside the European Union',
        paragraphs: [
          'Some of these providers are based in the United States. When data is transferred there, the transfers rely on the safeguards provided by the GDPR, such as the European Commission’s standard contractual clauses.',
        ],
      },
      {
        title: 'How long we keep it',
        paragraphs: [
          'Your data is kept as long as your account exists. When your account is deleted, your library, tracking, tickets, comments and suggestions are deleted with it.',
        ],
      },
      {
        title: 'Cookies and local storage',
        paragraphs: [
          'Synupsis only uses necessary cookies: the ones that keep you signed in. The site also stores in your browser what it needs to work offline once installed. As these are essential, they do not require consent.',
        ],
      },
      {
        title: 'Your rights',
        paragraphs: [
          `You can access, correct and delete your data, ask for a copy or object to its processing. Your avatar and languages can be changed from your profile; for anything else, and to delete your account, write to ${email}. We answer within one month.`,
          'If you believe your rights are not respected, you can lodge a complaint with the CNIL (cnil.fr), the French data protection authority.',
        ],
      },
      {
        title: 'Changes',
        paragraphs: [
          'We will update this page if the way Synupsis uses your data changes. The date at the top of the page shows the last change.',
        ],
      },
    ],
  },
};
