/**
 * Privacy, Terms, About and Contact — the four pages an ad-funded site needs,
 * in all seven locales.
 *
 * ## Why these exist
 *
 * AdSense does not approve a site without a privacy policy, and reviewers look
 * for About and Contact to establish a real publisher. Once adverts run, the
 * policy also stops being optional: Google's own terms require disclosing
 * third-party cookie use, as do the GDPR for European visitors and the DPDP
 * Act here.
 *
 * ## Why they are short, and site-specific
 *
 * Boilerplate from a policy generator describes collection that does not
 * happen here — server logs, account data, payment processors — and a
 * published claim that is false is worse than no page at all. Every sentence
 * below is about a static site whose tools run in the visitor's own browser.
 *
 * ## What varies at build time
 *
 * The analytics paragraph depends on GA4_ID and the advertising paragraph on
 * ADSENSE_ID. A site built without them says it has neither, and that stays
 * true. `{intro}` is each site's own meta description, so About describes the
 * tool rather than a generic "this website".
 */

export const PUBLISHER = {
  name: 'Vasanth M',
  email: 'vasanthm996@gmail.com',
  location: 'Trichy, Tamil Nadu, India',
  country: 'India',
  forum: 'Tiruchirappalli, Tamil Nadu',
};

/** Slugs stay English everywhere: short, stable, unambiguous in every locale. */
export const LEGAL_PAGES = ['privacy', 'terms', 'about', 'contact'];

export const LEGAL = {
  en: {
    ui: { back: 'Back to the tool', section: 'Site information', updated: 'Last updated {date}' },
    privacy: {
      title: 'Privacy Policy',
      description: 'What {site} does and does not collect. The tool runs in your browser, and your files never leave it.',
      sections: [
        ['Who runs this site', 'This site is operated by {publisher}, an individual publisher based in {location}. For anything on this page, write to {email}.'],
        ['The short version', 'Whatever you put into the tool stays on your device. It is processed by code running inside your browser and is never sent to a server, because there is no server to send it to: this is a static site, and the pages you are reading are files.'],
        ['What is stored on your device', 'Your settings and preferences are kept in your browser’s local storage so the tool remembers them next time. They never leave your device, and clearing your browser data removes them. Nothing you enter into the tool is included.'],
        ['Analytics', '{analytics}'],
        ['Advertising and cookies', '{advertising}'],
        ['Your rights', 'Because this site holds no personal data about you on any server, there is nothing for us to export, correct or delete on request. For data held by Google through advertising or analytics, use Google’s own controls at policies.google.com/technologies/partner-sites. If you are in the EU, the UK or India, you keep every right your law gives you, and you may write to the address above to exercise them.'],
        ['Children', 'These tools are not directed at children and do not knowingly collect information from anyone.'],
        ['Changes', 'If this policy changes, the date above changes with it.'],
      ],
      analyticsOff: 'This site runs no analytics. There is no measurement script on any page, and no record is kept of your visit.',
      analyticsOn: 'This site uses Google Analytics to count page views and which tools get used, so that effort goes where people actually need it. IP addresses are anonymised and advertising signals are switched off. Nothing you enter into the tool is sent to Google — not its content, not its length, not a hash of it.',
      adsOff: 'This site shows no adverts and sets no advertising cookies.',
      adsOn: 'This site is paid for by adverts supplied by Google AdSense. Google and its partners use cookies and similar technologies to serve and measure them, which means they may read and write cookies on your device. They receive the page address, your approximate location and your device type — never what you typed into the tool, which never leaves your browser. You can control this at adssettings.google.com, and visitors in the European Economic Area and the United Kingdom are asked for consent before any such cookie is set.',
    },
    terms: {
      title: 'Terms of Use',
      description: 'The terms for using {site}. Free to use, provided as is, with no warranty.',
      sections: [
        ['Using the site', 'You may use these tools for anything lawful, including commercial work, with no account, no licence fee and no attribution required. The output is yours.'],
        ['No warranty', 'The tools are provided as is. They are tested, but no software is free of defects, and a calculator, converter or generator can be wrong. Check anything that matters before relying on it — particularly figures used for tax, lending or legal purposes. {publisher} accepts no liability for loss arising from use of this site, to the fullest extent the law allows.'],
        ['Your files are your responsibility', 'Because processing happens in your browser, nothing is uploaded and nothing is backed up. If your browser closes mid-task, the work is gone. Keep your originals.'],
        ['Availability', 'This is a free site and may change, move or close at any time, without notice.'],
        ['Intellectual property', 'The site’s own design, text and code belong to {publisher}. Whatever you process with it remains entirely yours, and no claim is made over it.'],
        ['Governing law', 'These terms are governed by the laws of {country}, and the courts at {forum} have exclusive jurisdiction over any dispute.'],
      ],
    },
    about: {
      title: 'About',
      description: 'Who makes {site}, and why it works entirely in your browser.',
      sections: [
        ['What this is', '{intro}'],
        ['Why it runs in your browser', 'Most free tools of this kind upload your file to a server, process it there, and ask you to trust a privacy policy. This one does the work in the browser you are already using. Your file never travels, there is no queue, no size limit set by someone else’s server, and no copy left behind on a machine you do not control.'],
        ['Who makes it', 'This site is built and maintained by {publisher}, an independent developer in {location}. It is one of a small family of browser-based tools built on the same principle: do the work locally, charge nothing, and explain honestly how it works.'],
        ['How it is paid for', '{funding}'],
        ['Languages', 'Every page is available in English, Spanish, Portuguese, French, Hindi, Indonesian and Arabic — translated, not machine-switched at load.'],
        ['Getting in touch', 'Corrections, bug reports and feature requests are welcome at {email}. A report that names the browser and what you were doing is worth ten that do not.'],
      ],
      fundingFree: 'Nothing is sold here. There is no paid tier, no account and no upsell.',
      fundingAds: 'Adverts on the supporting pages cover the cost of running it. The tool itself stays free, complete and unrestricted — there is no paid version, because nothing is held back.',
    },
    contact: {
      title: 'Contact',
      description: 'How to reach the publisher of {site} — email, postal address, and what to put in a bug report.',
      sections: [
        ['Email', 'Write to {email}. That address reaches a person, not a ticketing system, and it is the right place for bug reports, corrections, privacy questions and anything legal.'],
        ['What to expect', 'This is run by one person alongside other work, so a reply usually takes a few days. A message describing what you did, what you expected and what happened instead will be answered faster than one that does not.'],
        ['Postal address', '{publisher}, {location}'],
        ['Reporting a problem', 'If a result looks wrong, send the input that produced it, the browser you used, and what you expected instead. Because everything runs on your device, there are no server logs for anyone to check — your description is the only evidence there is.'],
      ],
    },
  },

  es: {
    ui: { back: 'Volver a la herramienta', section: 'Información del sitio', updated: 'Última actualización: {date}' },
    privacy: {
      title: 'Política de privacidad',
      description: 'Qué recopila y qué no recopila {site}. La herramienta funciona en tu navegador y tus archivos nunca salen de él.',
      sections: [
        ['Quién gestiona este sitio', 'Este sitio lo gestiona {publisher}, editor individual con sede en {location}. Para cualquier cuestión de esta página, escribe a {email}.'],
        ['La versión corta', 'Todo lo que pones en la herramienta se queda en tu dispositivo. Lo procesa código que se ejecuta dentro de tu navegador y nunca se envía a un servidor, porque no hay servidor al que enviarlo: este es un sitio estático y las páginas que lees son archivos.'],
        ['Qué se guarda en tu dispositivo', 'Tus ajustes y preferencias se guardan en el almacenamiento local del navegador para que la herramienta los recuerde. Nunca salen de tu dispositivo y se borran al limpiar los datos del navegador. No se incluye nada de lo que escribas en la herramienta.'],
        ['Analítica', '{analytics}'],
        ['Publicidad y cookies', '{advertising}'],
        ['Tus derechos', 'Como este sitio no guarda datos personales tuyos en ningún servidor, no hay nada que podamos exportar, corregir o eliminar a petición. Para los datos que Google conserve por publicidad o analítica, usa los controles de Google en policies.google.com/technologies/partner-sites. Si estás en la UE, el Reino Unido o la India, conservas todos los derechos que te da tu legislación y puedes escribir a la dirección indicada para ejercerlos.'],
        ['Menores', 'Estas herramientas no están dirigidas a menores y no recopilan información de nadie a sabiendas.'],
        ['Cambios', 'Si esta política cambia, la fecha de arriba cambia con ella.'],
      ],
      analyticsOff: 'Este sitio no usa analítica. No hay ningún script de medición en ninguna página y no queda registro de tu visita.',
      analyticsOn: 'Este sitio usa Google Analytics para contar páginas vistas y qué herramientas se usan, de modo que el esfuerzo vaya donde de verdad hace falta. Las direcciones IP se anonimizan y las señales publicitarias están desactivadas. Nada de lo que escribes en la herramienta se envía a Google: ni su contenido, ni su longitud, ni un hash de él.',
      adsOff: 'Este sitio no muestra anuncios ni instala cookies publicitarias.',
      adsOn: 'Este sitio se financia con anuncios de Google AdSense. Google y sus socios usan cookies y tecnologías similares para servirlos y medirlos, lo que significa que pueden leer y escribir cookies en tu dispositivo. Reciben la dirección de la página, tu ubicación aproximada y tu tipo de dispositivo; nunca lo que escribiste en la herramienta, que no sale de tu navegador. Puedes controlarlo en adssettings.google.com, y a los visitantes del Espacio Económico Europeo y del Reino Unido se les pide consentimiento antes de instalar ninguna de esas cookies.',
    },
    terms: {
      title: 'Términos de uso',
      description: 'Los términos de uso de {site}. Gratis, tal cual, sin garantía.',
      sections: [
        ['Uso del sitio', 'Puedes usar estas herramientas para cualquier fin lícito, incluido el trabajo comercial, sin cuenta, sin licencia y sin necesidad de atribución. El resultado es tuyo.'],
        ['Sin garantía', 'Las herramientas se ofrecen tal cual. Están probadas, pero ningún software está libre de defectos, y una calculadora, un conversor o un generador pueden equivocarse. Comprueba lo que importe antes de confiar en ello, sobre todo las cifras usadas con fines fiscales, crediticios o legales. {publisher} no asume responsabilidad por pérdidas derivadas del uso de este sitio, en la máxima medida que permita la ley.'],
        ['Tus archivos son responsabilidad tuya', 'Como el procesamiento ocurre en tu navegador, nada se sube y nada se respalda. Si el navegador se cierra a mitad, el trabajo se pierde. Conserva tus originales.'],
        ['Disponibilidad', 'Este es un sitio gratuito y puede cambiar, mudarse o cerrar en cualquier momento y sin aviso.'],
        ['Propiedad intelectual', 'El diseño, los textos y el código del sitio pertenecen a {publisher}. Lo que proceses con él sigue siendo enteramente tuyo y no se reclama ningún derecho sobre ello.'],
        ['Legislación aplicable', 'Estos términos se rigen por las leyes de {country}, y los tribunales de {forum} tienen jurisdicción exclusiva sobre cualquier disputa.'],
      ],
    },
    about: {
      title: 'Acerca de',
      description: 'Quién hace {site} y por qué funciona enteramente en tu navegador.',
      sections: [
        ['Qué es esto', '{intro}'],
        ['Por qué funciona en tu navegador', 'La mayoría de herramientas gratuitas de este tipo suben tu archivo a un servidor, lo procesan allí y te piden que confíes en una política de privacidad. Esta hace el trabajo en el navegador que ya estás usando. Tu archivo no viaja, no hay cola, no hay límite de tamaño impuesto por el servidor de otro y no queda ninguna copia en una máquina que no controlas.'],
        ['Quién la hace', 'Este sitio lo construye y mantiene {publisher}, desarrollador independiente en {location}. Forma parte de una pequeña familia de herramientas en el navegador construidas con el mismo principio: hacer el trabajo en local, no cobrar nada y explicar con honestidad cómo funciona.'],
        ['Cómo se paga', '{funding}'],
        ['Idiomas', 'Todas las páginas están en inglés, español, portugués, francés, hindi, indonesio y árabe, traducidas y no conmutadas por máquina al cargar.'],
        ['Contacto', 'Correcciones, informes de errores y peticiones de funciones son bienvenidos en {email}. Un informe que indique el navegador y lo que estabas haciendo vale por diez que no lo hagan.'],
      ],
      fundingFree: 'Aquí no se vende nada. No hay plan de pago, ni cuenta, ni venta adicional.',
      fundingAds: 'Los anuncios de las páginas de apoyo cubren el coste de mantenerlo. La herramienta en sí sigue siendo gratuita, completa y sin restricciones: no hay versión de pago, porque no se retiene nada.',
    },
    contact: {
      title: 'Contacto',
      description: 'Cómo contactar con el editor de {site}: correo, dirección postal y qué incluir en un informe de error.',
      sections: [
        ['Correo electrónico', 'Escribe a {email}. Esa dirección llega a una persona, no a un sistema de tickets, y es el lugar adecuado para errores, correcciones, dudas de privacidad y asuntos legales.'],
        ['Qué esperar', 'Lo lleva una sola persona junto con otro trabajo, así que la respuesta suele tardar unos días. Un mensaje que explique qué hiciste, qué esperabas y qué ocurrió en su lugar se responderá antes que uno que no lo haga.'],
        ['Dirección postal', '{publisher}, {location}'],
        ['Informar de un problema', 'Si un resultado parece incorrecto, envía la entrada que lo produjo, el navegador que usaste y lo que esperabas. Como todo se ejecuta en tu dispositivo, no hay registros de servidor que nadie pueda consultar: tu descripción es la única prueba que existe.'],
      ],
    },
  },

  pt: {
    ui: { back: 'Voltar à ferramenta', section: 'Informações do site', updated: 'Última atualização: {date}' },
    privacy: {
      title: 'Política de Privacidade',
      description: 'O que o {site} coleta e o que não coleta. A ferramenta roda no seu navegador e seus arquivos nunca saem dele.',
      sections: [
        ['Quem mantém este site', 'Este site é operado por {publisher}, editor individual baseado em {location}. Para qualquer assunto desta página, escreva para {email}.'],
        ['A versão curta', 'Tudo o que você coloca na ferramenta fica no seu dispositivo. É processado por código que roda dentro do seu navegador e nunca é enviado a um servidor, porque não existe servidor para onde enviar: este é um site estático e as páginas que você lê são arquivos.'],
        ['O que fica guardado no seu dispositivo', 'Suas configurações e preferências ficam no armazenamento local do navegador para que a ferramenta se lembre delas. Nunca saem do seu dispositivo e são apagadas ao limpar os dados do navegador. Nada do que você digita na ferramenta é incluído.'],
        ['Análises', '{analytics}'],
        ['Publicidade e cookies', '{advertising}'],
        ['Seus direitos', 'Como este site não guarda dados pessoais seus em nenhum servidor, não há nada para exportar, corrigir ou apagar mediante pedido. Para dados que o Google mantenha por publicidade ou análises, use os controles do próprio Google em policies.google.com/technologies/partner-sites. Se você está na UE, no Reino Unido ou na Índia, mantém todos os direitos que sua lei lhe dá e pode escrever para o endereço acima para exercê-los.'],
        ['Crianças', 'Estas ferramentas não são direcionadas a crianças e não coletam informações de ninguém conscientemente.'],
        ['Alterações', 'Se esta política mudar, a data acima muda junto.'],
      ],
      analyticsOff: 'Este site não usa análises. Não há script de medição em nenhuma página e não fica registro da sua visita.',
      analyticsOn: 'Este site usa o Google Analytics para contar visualizações e quais ferramentas são usadas, para que o esforço vá onde realmente é preciso. Os endereços IP são anonimizados e os sinais de publicidade ficam desligados. Nada do que você digita na ferramenta é enviado ao Google — nem o conteúdo, nem o tamanho, nem um hash dele.',
      adsOff: 'Este site não exibe anúncios nem define cookies de publicidade.',
      adsOn: 'Este site é custeado por anúncios do Google AdSense. O Google e seus parceiros usam cookies e tecnologias semelhantes para exibi-los e medi-los, o que significa que podem ler e gravar cookies no seu dispositivo. Eles recebem o endereço da página, sua localização aproximada e o tipo de dispositivo — nunca o que você digitou na ferramenta, que não sai do seu navegador. Você pode controlar isso em adssettings.google.com, e visitantes do Espaço Económico Europeu e do Reino Unido recebem um pedido de consentimento antes de qualquer cookie desse tipo.',
    },
    terms: {
      title: 'Termos de Uso',
      description: 'Os termos de uso do {site}. Grátis, no estado em que se encontra, sem garantia.',
      sections: [
        ['Uso do site', 'Você pode usar estas ferramentas para qualquer fim lícito, inclusive comercial, sem conta, sem licença e sem necessidade de atribuição. O resultado é seu.'],
        ['Sem garantia', 'As ferramentas são fornecidas no estado em que se encontram. São testadas, mas nenhum software é livre de defeitos, e uma calculadora, um conversor ou um gerador podem errar. Confira o que importa antes de confiar — sobretudo números usados para fins fiscais, de crédito ou jurídicos. {publisher} não assume responsabilidade por perdas decorrentes do uso deste site, na máxima medida permitida por lei.'],
        ['Seus arquivos são sua responsabilidade', 'Como o processamento acontece no seu navegador, nada é enviado e nada tem backup. Se o navegador fechar no meio, o trabalho se perde. Guarde seus originais.'],
        ['Disponibilidade', 'Este é um site gratuito e pode mudar, mudar de endereço ou encerrar a qualquer momento, sem aviso.'],
        ['Propriedade intelectual', 'O design, os textos e o código do site pertencem a {publisher}. O que você processa com ele continua inteiramente seu, e nenhuma reivindicação é feita sobre isso.'],
        ['Lei aplicável', 'Estes termos são regidos pelas leis da {country}, e os tribunais de {forum} têm jurisdição exclusiva sobre qualquer disputa.'],
      ],
    },
    about: {
      title: 'Sobre',
      description: 'Quem faz o {site} e por que ele funciona inteiramente no seu navegador.',
      sections: [
        ['O que é isto', '{intro}'],
        ['Por que roda no seu navegador', 'A maioria das ferramentas gratuitas desse tipo envia seu arquivo a um servidor, processa lá e pede que você confie numa política de privacidade. Esta faz o trabalho no navegador que você já está usando. Seu arquivo não viaja, não há fila, não há limite de tamanho imposto pelo servidor de outra pessoa e não fica cópia numa máquina que você não controla.'],
        ['Quem faz', 'Este site é construído e mantido por {publisher}, desenvolvedor independente em {location}. É um de uma pequena família de ferramentas no navegador feitas com o mesmo princípio: fazer o trabalho localmente, não cobrar nada e explicar com honestidade como funciona.'],
        ['Como é custeado', '{funding}'],
        ['Idiomas', 'Todas as páginas estão em inglês, espanhol, português, francês, híndi, indonésio e árabe — traduzidas, não trocadas por máquina no carregamento.'],
        ['Fale comigo', 'Correções, relatos de erro e pedidos de recurso são bem-vindos em {email}. Um relato que diga o navegador e o que você estava fazendo vale por dez que não digam.'],
      ],
      fundingFree: 'Nada é vendido aqui. Não há plano pago, conta nem venda adicional.',
      fundingAds: 'Os anúncios nas páginas de apoio cobrem o custo de manter o site. A ferramenta em si continua gratuita, completa e sem restrições — não há versão paga, porque nada é retido.',
    },
    contact: {
      title: 'Contato',
      description: 'Como falar com o responsável pelo {site}: e-mail, endereço postal e o que incluir num relato de erro.',
      sections: [
        ['E-mail', 'Escreva para {email}. Esse endereço chega a uma pessoa, não a um sistema de chamados, e é o lugar certo para erros, correções, dúvidas de privacidade e assuntos jurídicos.'],
        ['O que esperar', 'É tocado por uma pessoa junto com outros trabalhos, então a resposta costuma levar alguns dias. Uma mensagem que descreva o que você fez, o que esperava e o que aconteceu será respondida antes de uma que não descreva.'],
        ['Endereço postal', '{publisher}, {location}'],
        ['Relatar um problema', 'Se um resultado parecer errado, envie a entrada que o produziu, o navegador que usou e o que esperava. Como tudo roda no seu dispositivo, não há registros de servidor para ninguém consultar — sua descrição é a única evidência que existe.'],
      ],
    },
  },

  fr: {
    ui: { back: 'Retour à l’outil', section: 'Informations sur le site', updated: 'Dernière mise à jour : {date}' },
    privacy: {
      title: 'Politique de confidentialité',
      description: 'Ce que {site} collecte et ne collecte pas. L’outil fonctionne dans votre navigateur et vos fichiers n’en sortent jamais.',
      sections: [
        ['Qui gère ce site', 'Ce site est exploité par {publisher}, éditeur individuel établi à {location}. Pour toute question relative à cette page, écrivez à {email}.'],
        ['En bref', 'Tout ce que vous mettez dans l’outil reste sur votre appareil. Le traitement est effectué par du code qui s’exécute dans votre navigateur et n’est jamais envoyé à un serveur, car il n’y a pas de serveur où l’envoyer : ce site est statique et les pages que vous lisez sont des fichiers.'],
        ['Ce qui est conservé sur votre appareil', 'Vos réglages et préférences sont conservés dans le stockage local de votre navigateur afin que l’outil s’en souvienne. Ils ne quittent jamais votre appareil et disparaissent lorsque vous effacez les données du navigateur. Rien de ce que vous saisissez dans l’outil n’y figure.'],
        ['Mesure d’audience', '{analytics}'],
        ['Publicité et cookies', '{advertising}'],
        ['Vos droits', 'Comme ce site ne conserve aucune donnée personnelle vous concernant sur un serveur, il n’y a rien à exporter, corriger ou supprimer sur demande. Pour les données détenues par Google via la publicité ou la mesure d’audience, utilisez les commandes de Google sur policies.google.com/technologies/partner-sites. Si vous êtes dans l’UE, au Royaume-Uni ou en Inde, vous conservez tous les droits que votre loi vous accorde et pouvez écrire à l’adresse ci-dessus pour les exercer.'],
        ['Enfants', 'Ces outils ne s’adressent pas aux enfants et ne collectent sciemment d’informations sur personne.'],
        ['Modifications', 'Si cette politique change, la date ci-dessus change avec elle.'],
      ],
      analyticsOff: 'Ce site n’utilise aucune mesure d’audience. Aucun script de mesure n’est présent sur aucune page et aucune trace de votre visite n’est conservée.',
      analyticsOn: 'Ce site utilise Google Analytics pour compter les pages vues et savoir quels outils servent, afin que les efforts aillent là où ils sont utiles. Les adresses IP sont anonymisées et les signaux publicitaires sont désactivés. Rien de ce que vous saisissez dans l’outil n’est envoyé à Google — ni son contenu, ni sa longueur, ni une empreinte de celui-ci.',
      adsOff: 'Ce site n’affiche aucune publicité et ne dépose aucun cookie publicitaire.',
      adsOn: 'Ce site est financé par des publicités fournies par Google AdSense. Google et ses partenaires utilisent des cookies et des technologies similaires pour les diffuser et les mesurer, ce qui signifie qu’ils peuvent lire et écrire des cookies sur votre appareil. Ils reçoivent l’adresse de la page, votre localisation approximative et votre type d’appareil — jamais ce que vous avez saisi dans l’outil, qui ne quitte pas votre navigateur. Vous pouvez gérer cela sur adssettings.google.com, et les visiteurs de l’Espace économique européen et du Royaume-Uni voient une demande de consentement avant le dépôt de tels cookies.',
    },
    terms: {
      title: 'Conditions d’utilisation',
      description: 'Les conditions d’utilisation de {site}. Gratuit, en l’état, sans garantie.',
      sections: [
        ['Utilisation du site', 'Vous pouvez utiliser ces outils à toute fin licite, y compris commerciale, sans compte, sans redevance et sans attribution. Le résultat vous appartient.'],
        ['Absence de garantie', 'Les outils sont fournis en l’état. Ils sont testés, mais aucun logiciel n’est exempt de défauts, et une calculatrice, un convertisseur ou un générateur peuvent se tromper. Vérifiez ce qui compte avant de vous y fier, en particulier les chiffres utilisés à des fins fiscales, de crédit ou juridiques. {publisher} décline toute responsabilité pour les pertes résultant de l’utilisation de ce site, dans toute la mesure permise par la loi.'],
        ['Vos fichiers relèvent de vous', 'Le traitement ayant lieu dans votre navigateur, rien n’est envoyé et rien n’est sauvegardé. Si le navigateur se ferme en cours de route, le travail est perdu. Conservez vos originaux.'],
        ['Disponibilité', 'Ce site est gratuit et peut changer, déménager ou fermer à tout moment, sans préavis.'],
        ['Propriété intellectuelle', 'La conception, les textes et le code du site appartiennent à {publisher}. Ce que vous traitez avec lui reste entièrement vôtre, et aucune revendication n’est faite dessus.'],
        ['Droit applicable', 'Les présentes conditions sont régies par le droit de l’{country}, et les tribunaux de {forum} ont compétence exclusive pour tout litige.'],
      ],
    },
    about: {
      title: 'À propos',
      description: 'Qui réalise {site}, et pourquoi tout fonctionne dans votre navigateur.',
      sections: [
        ['De quoi s’agit-il', '{intro}'],
        ['Pourquoi tout se passe dans votre navigateur', 'La plupart des outils gratuits de ce type envoient votre fichier sur un serveur, le traitent là-bas et vous demandent de faire confiance à une politique de confidentialité. Celui-ci travaille dans le navigateur que vous utilisez déjà. Votre fichier ne voyage pas, il n’y a ni file d’attente, ni limite de taille imposée par le serveur d’un autre, ni copie laissée sur une machine que vous ne contrôlez pas.'],
        ['Qui le réalise', 'Ce site est conçu et maintenu par {publisher}, développeur indépendant à {location}. Il fait partie d’une petite famille d’outils en navigateur bâtis sur le même principe : travailler en local, ne rien facturer et expliquer honnêtement le fonctionnement.'],
        ['Comment il est financé', '{funding}'],
        ['Langues', 'Chaque page existe en anglais, espagnol, portugais, français, hindi, indonésien et arabe — traduites, et non permutées par une machine au chargement.'],
        ['Me contacter', 'Corrections, rapports de bogue et demandes de fonctionnalités sont bienvenus à {email}. Un rapport qui précise le navigateur et ce que vous faisiez en vaut dix qui ne le font pas.'],
      ],
      fundingFree: 'Rien n’est vendu ici. Pas de formule payante, pas de compte, pas de vente additionnelle.',
      fundingAds: 'Les publicités des pages d’accompagnement couvrent les frais de fonctionnement. L’outil lui-même reste gratuit, complet et sans restriction : il n’y a pas de version payante, parce que rien n’est retenu.',
    },
    contact: {
      title: 'Contact',
      description: 'Comment joindre l’éditeur de {site} : e-mail, adresse postale et quoi indiquer dans un rapport de bogue.',
      sections: [
        ['E-mail', 'Écrivez à {email}. Cette adresse aboutit à une personne, pas à un système de tickets, et c’est le bon endroit pour les bogues, les corrections, les questions de confidentialité et le juridique.'],
        ['À quoi s’attendre', 'Le site est tenu par une seule personne en parallèle d’autres activités, la réponse prend donc généralement quelques jours. Un message décrivant ce que vous avez fait, ce que vous attendiez et ce qui s’est produit obtiendra une réponse plus rapide.'],
        ['Adresse postale', '{publisher}, {location}'],
        ['Signaler un problème', 'Si un résultat paraît faux, envoyez l’entrée qui l’a produit, le navigateur utilisé et ce que vous attendiez. Comme tout s’exécute sur votre appareil, aucun journal serveur n’est consultable — votre description est la seule preuve qui existe.'],
      ],
    },
  },

  hi: {
    ui: { back: 'टूल पर वापस जाएँ', section: 'साइट की जानकारी', updated: 'आख़िरी बार बदला गया: {date}' },
    privacy: {
      title: 'गोपनीयता नीति',
      description: '{site} क्या इकट्ठा करता है और क्या नहीं। टूल आपके ब्राउज़र में चलता है और आपकी फ़ाइलें कभी बाहर नहीं जातीं।',
      sections: [
        ['यह साइट कौन चलाता है', 'यह साइट {publisher} चलाते हैं, जो {location} में रहने वाले एक स्वतंत्र प्रकाशक हैं। इस पेज से जुड़ी किसी भी बात के लिए {email} पर लिखें।'],
        ['छोटा जवाब', 'आप टूल में जो भी डालते हैं वह आपके डिवाइस पर ही रहता है। उसे आपके ब्राउज़र के अंदर चलने वाला कोड प्रोसेस करता है और वह कभी किसी सर्वर पर नहीं भेजा जाता, क्योंकि भेजने के लिए कोई सर्वर है ही नहीं: यह एक स्टैटिक साइट है और जो पेज आप पढ़ रहे हैं वे फ़ाइलें हैं।'],
        ['आपके डिवाइस पर क्या सहेजा जाता है', 'आपकी सेटिंग्स और पसंद ब्राउज़र के लोकल स्टोरेज में रहती हैं ताकि टूल उन्हें अगली बार याद रखे। वे कभी आपके डिवाइस से बाहर नहीं जातीं, और ब्राउज़र डेटा मिटाने पर हट जाती हैं। टूल में आपने जो डाला, वह इसमें शामिल नहीं होता।'],
        ['एनालिटिक्स', '{analytics}'],
        ['विज्ञापन और कुकीज़', '{advertising}'],
        ['आपके अधिकार', 'चूँकि यह साइट आपका कोई निजी डेटा किसी सर्वर पर नहीं रखती, इसलिए अनुरोध पर निर्यात, सुधार या मिटाने के लिए हमारे पास कुछ है ही नहीं। विज्ञापन या एनालिटिक्स के ज़रिए Google के पास जो डेटा है, उसके लिए policies.google.com/technologies/partner-sites पर Google के अपने नियंत्रण इस्तेमाल करें। यदि आप EU, UK या भारत में हैं, तो आपके क़ानून से मिले सभी अधिकार बने रहते हैं और आप ऊपर दिए पते पर लिखकर उनका उपयोग कर सकते हैं।'],
        ['बच्चे', 'ये टूल बच्चों के लिए नहीं बनाए गए हैं और जानबूझकर किसी से कोई जानकारी इकट्ठा नहीं करते।'],
        ['बदलाव', 'अगर यह नीति बदलेगी तो ऊपर दी तारीख़ भी बदल जाएगी।'],
      ],
      analyticsOff: 'यह साइट कोई एनालिटिक्स इस्तेमाल नहीं करती। किसी भी पेज पर कोई मापने वाला स्क्रिप्ट नहीं है और आपकी विज़िट का कोई रिकॉर्ड नहीं रखा जाता।',
      analyticsOn: 'यह साइट Google Analytics से पेज व्यू और कौन-से टूल इस्तेमाल होते हैं, यह गिनती है ताकि मेहनत वहीं लगे जहाँ सच में ज़रूरत है। IP पते गुमनाम किए जाते हैं और विज्ञापन सिग्नल बंद रहते हैं। टूल में आप जो डालते हैं, उसका कुछ भी Google को नहीं भेजा जाता — न सामग्री, न लंबाई, न उसका हैश।',
      adsOff: 'यह साइट कोई विज्ञापन नहीं दिखाती और कोई विज्ञापन कुकी सेट नहीं करती।',
      adsOn: 'इस साइट का ख़र्च Google AdSense के विज्ञापनों से चलता है। Google और उसके साझेदार उन्हें दिखाने और मापने के लिए कुकीज़ व मिलती-जुलती तकनीकें इस्तेमाल करते हैं, यानी वे आपके डिवाइस पर कुकीज़ पढ़ और लिख सकते हैं। उन्हें पेज का पता, आपका अनुमानित स्थान और डिवाइस का प्रकार मिलता है — वह कभी नहीं जो आपने टूल में लिखा, क्योंकि वह आपके ब्राउज़र से बाहर जाता ही नहीं। आप इसे adssettings.google.com पर नियंत्रित कर सकते हैं, और यूरोपीय आर्थिक क्षेत्र तथा यूके के विज़िटर से ऐसी कोई कुकी सेट करने से पहले सहमति माँगी जाती है।',
    },
    terms: {
      title: 'उपयोग की शर्तें',
      description: '{site} के उपयोग की शर्तें। मुफ़्त, जैसा है वैसा, बिना किसी वारंटी के।',
      sections: [
        ['साइट का उपयोग', 'आप इन टूल का किसी भी वैध काम के लिए उपयोग कर सकते हैं, व्यावसायिक काम समेत — बिना खाते, बिना लाइसेंस शुल्क और बिना श्रेय दिए। परिणाम आपका है।'],
        ['कोई वारंटी नहीं', 'ये टूल जैसे हैं वैसे दिए गए हैं। इनकी जाँच होती है, पर कोई सॉफ़्टवेयर दोषरहित नहीं होता, और कैलकुलेटर, कन्वर्टर या जनरेटर ग़लत हो सकता है। जो बात मायने रखती है उस पर भरोसा करने से पहले जाँच लें — ख़ासकर कर, ऋण या क़ानूनी काम में इस्तेमाल होने वाले आँकड़े। {publisher} इस साइट के उपयोग से हुए किसी नुक़सान की ज़िम्मेदारी नहीं लेते, जहाँ तक क़ानून अनुमति देता है।'],
        ['आपकी फ़ाइलें आपकी ज़िम्मेदारी', 'चूँकि प्रोसेसिंग आपके ब्राउज़र में होती है, कुछ भी अपलोड नहीं होता और कुछ भी बैकअप नहीं होता। बीच में ब्राउज़र बंद हो गया तो काम चला जाएगा। अपने मूल फ़ाइलें संभाल कर रखें।'],
        ['उपलब्धता', 'यह एक मुफ़्त साइट है और कभी भी, बिना सूचना के बदल सकती है, जगह बदल सकती है या बंद हो सकती है।'],
        ['बौद्धिक संपदा', 'साइट का अपना डिज़ाइन, टेक्स्ट और कोड {publisher} का है। इससे आप जो भी प्रोसेस करते हैं वह पूरी तरह आपका रहता है, उस पर कोई दावा नहीं किया जाता।'],
        ['लागू क़ानून', 'ये शर्तें {country} के क़ानूनों से संचालित होती हैं, और किसी भी विवाद पर {forum} की अदालतों का विशेष अधिकार क्षेत्र होगा।'],
      ],
    },
    about: {
      title: 'हमारे बारे में',
      description: '{site} कौन बनाता है, और यह पूरी तरह आपके ब्राउज़र में क्यों चलता है।',
      sections: [
        ['यह क्या है', '{intro}'],
        ['यह आपके ब्राउज़र में क्यों चलता है', 'इस तरह के ज़्यादातर मुफ़्त टूल आपकी फ़ाइल सर्वर पर भेजते हैं, वहीं प्रोसेस करते हैं, और आपसे कहते हैं कि उनकी गोपनीयता नीति पर भरोसा कीजिए। यह टूल वही काम उसी ब्राउज़र में करता है जो आप पहले से चला रहे हैं। आपकी फ़ाइल कहीं जाती ही नहीं, कोई क़तार नहीं, किसी और के सर्वर की तय की हुई कोई साइज़ सीमा नहीं, और किसी ऐसी मशीन पर कोई कॉपी नहीं बचती जिस पर आपका नियंत्रण न हो।'],
        ['इसे कौन बनाता है', 'यह साइट {publisher} बनाते और संभालते हैं, जो {location} में एक स्वतंत्र डेवलपर हैं। यह ब्राउज़र पर चलने वाले टूल के एक छोटे परिवार का हिस्सा है, जो एक ही सिद्धांत पर बने हैं: काम स्थानीय रूप से करो, कुछ मत वसूलो, और ईमानदारी से बताओ कि यह कैसे काम करता है।'],
        ['इसका ख़र्च कैसे चलता है', '{funding}'],
        ['भाषाएँ', 'हर पेज अंग्रेज़ी, स्पेनिश, पुर्तगाली, फ़्रेंच, हिंदी, इंडोनेशियाई और अरबी में उपलब्ध है — अनुवादित, न कि लोड होते समय मशीन से बदला हुआ।'],
        ['संपर्क', 'सुधार, बग रिपोर्ट और नई सुविधाओं के सुझाव {email} पर स्वागत योग्य हैं। जिस रिपोर्ट में ब्राउज़र और आप क्या कर रहे थे यह लिखा हो, वह दस ऐसी रिपोर्टों से बेहतर है जिनमें नहीं लिखा।'],
      ],
      fundingFree: 'यहाँ कुछ भी नहीं बेचा जाता। कोई पेड प्लान नहीं, कोई खाता नहीं, कोई अपसेल नहीं।',
      fundingAds: 'सहायक पेजों पर दिखने वाले विज्ञापन इसे चलाने का ख़र्च उठाते हैं। टूल ख़ुद मुफ़्त, पूरा और बिना रोक-टोक रहता है — कोई पेड वर्ज़न नहीं है, क्योंकि कुछ रोका ही नहीं गया।',
    },
    contact: {
      title: 'संपर्क',
      description: '{site} के प्रकाशक से संपर्क कैसे करें — ईमेल, डाक पता, और बग रिपोर्ट में क्या लिखें।',
      sections: [
        ['ईमेल', '{email} पर लिखें। यह पता एक इंसान तक पहुँचता है, किसी टिकट सिस्टम तक नहीं, और बग, सुधार, गोपनीयता के सवाल तथा क़ानूनी बातों के लिए यही सही जगह है।'],
        ['क्या उम्मीद रखें', 'इसे एक ही व्यक्ति दूसरे कामों के साथ चलाता है, इसलिए जवाब में आमतौर पर कुछ दिन लगते हैं। जिस संदेश में लिखा हो कि आपने क्या किया, क्या उम्मीद थी और इसके बजाय क्या हुआ, उसका जवाब जल्दी मिलेगा।'],
        ['डाक पता', '{publisher}, {location}'],
        ['समस्या बताना', 'अगर कोई नतीजा ग़लत लगे, तो वही इनपुट भेजें जिससे वह बना, कौन-सा ब्राउज़र इस्तेमाल किया, और आपको क्या उम्मीद थी। चूँकि सब कुछ आपके डिवाइस पर चलता है, जाँचने के लिए किसी के पास कोई सर्वर लॉग नहीं है — आपका विवरण ही एकमात्र सबूत है।'],
      ],
    },
  },

  id: {
    ui: { back: 'Kembali ke alat', section: 'Informasi situs', updated: 'Terakhir diperbarui {date}' },
    privacy: {
      title: 'Kebijakan Privasi',
      description: 'Apa yang dikumpulkan dan tidak dikumpulkan {site}. Alatnya berjalan di peramban Anda dan berkas Anda tidak pernah keluar.',
      sections: [
        ['Siapa yang menjalankan situs ini', 'Situs ini dijalankan oleh {publisher}, penerbit perseorangan yang berbasis di {location}. Untuk hal apa pun di halaman ini, tulis ke {email}.'],
        ['Versi singkatnya', 'Apa pun yang Anda masukkan ke alat ini tetap di perangkat Anda. Pemrosesannya dilakukan oleh kode yang berjalan di dalam peramban Anda dan tidak pernah dikirim ke server, karena memang tidak ada server tujuannya: ini situs statis dan halaman yang Anda baca adalah berkas.'],
        ['Apa yang disimpan di perangkat Anda', 'Setelan dan preferensi Anda disimpan di penyimpanan lokal peramban agar alat ini mengingatnya. Semua itu tidak pernah meninggalkan perangkat Anda dan hilang saat Anda membersihkan data peramban. Apa pun yang Anda ketik ke alat tidak termasuk di dalamnya.'],
        ['Analitik', '{analytics}'],
        ['Iklan dan kuki', '{advertising}'],
        ['Hak Anda', 'Karena situs ini tidak menyimpan data pribadi Anda di server mana pun, tidak ada yang bisa kami ekspor, perbaiki, atau hapus atas permintaan. Untuk data yang dipegang Google melalui iklan atau analitik, gunakan kontrol Google sendiri di policies.google.com/technologies/partner-sites. Jika Anda berada di UE, Inggris, atau India, Anda tetap memiliki semua hak yang diberikan hukum Anda dan dapat menulis ke alamat di atas untuk menggunakannya.'],
        ['Anak-anak', 'Alat ini tidak ditujukan untuk anak-anak dan tidak dengan sengaja mengumpulkan informasi dari siapa pun.'],
        ['Perubahan', 'Jika kebijakan ini berubah, tanggal di atas ikut berubah.'],
      ],
      analyticsOff: 'Situs ini tidak menjalankan analitik. Tidak ada skrip pengukuran di halaman mana pun, dan tidak ada catatan kunjungan Anda.',
      analyticsOn: 'Situs ini memakai Google Analytics untuk menghitung tampilan halaman dan alat mana yang dipakai, supaya usaha diarahkan ke tempat yang benar-benar dibutuhkan. Alamat IP dianonimkan dan sinyal iklan dimatikan. Apa pun yang Anda ketik ke alat tidak dikirim ke Google — bukan isinya, bukan panjangnya, bukan pula hash-nya.',
      adsOff: 'Situs ini tidak menampilkan iklan dan tidak menyetel kuki iklan.',
      adsOn: 'Situs ini dibiayai oleh iklan dari Google AdSense. Google dan mitranya memakai kuki dan teknologi serupa untuk menayangkan dan mengukurnya, artinya mereka dapat membaca dan menulis kuki di perangkat Anda. Mereka menerima alamat halaman, perkiraan lokasi, dan jenis perangkat Anda — tidak pernah apa yang Anda ketik di alat, yang tidak keluar dari peramban Anda. Anda dapat mengaturnya di adssettings.google.com, dan pengunjung di Wilayah Ekonomi Eropa serta Inggris dimintai persetujuan sebelum kuki semacam itu disetel.',
    },
    terms: {
      title: 'Ketentuan Penggunaan',
      description: 'Ketentuan penggunaan {site}. Gratis, apa adanya, tanpa jaminan.',
      sections: [
        ['Menggunakan situs', 'Anda boleh memakai alat ini untuk keperluan apa pun yang sah, termasuk pekerjaan komersial, tanpa akun, tanpa biaya lisensi, dan tanpa perlu mencantumkan sumber. Hasilnya milik Anda.'],
        ['Tanpa jaminan', 'Alat ini disediakan apa adanya. Sudah diuji, tetapi tidak ada perangkat lunak yang bebas cacat, dan kalkulator, pengonversi, atau generator bisa saja salah. Periksa hal yang penting sebelum mengandalkannya — terutama angka untuk pajak, pinjaman, atau keperluan hukum. {publisher} tidak bertanggung jawab atas kerugian yang timbul dari penggunaan situs ini, sejauh diizinkan hukum.'],
        ['Berkas Anda tanggung jawab Anda', 'Karena pemrosesan terjadi di peramban Anda, tidak ada yang diunggah dan tidak ada cadangan. Jika peramban tertutup di tengah jalan, pekerjaannya hilang. Simpan berkas asli Anda.'],
        ['Ketersediaan', 'Ini situs gratis dan dapat berubah, pindah, atau ditutup kapan saja tanpa pemberitahuan.'],
        ['Kekayaan intelektual', 'Desain, teks, dan kode situs ini milik {publisher}. Apa pun yang Anda proses dengannya sepenuhnya tetap milik Anda, dan tidak ada klaim atasnya.'],
        ['Hukum yang berlaku', 'Ketentuan ini tunduk pada hukum {country}, dan pengadilan di {forum} memiliki yurisdiksi eksklusif atas setiap sengketa.'],
      ],
    },
    about: {
      title: 'Tentang',
      description: 'Siapa yang membuat {site}, dan mengapa semuanya berjalan di peramban Anda.',
      sections: [
        ['Apa ini', '{intro}'],
        ['Mengapa berjalan di peramban Anda', 'Kebanyakan alat gratis sejenis mengunggah berkas Anda ke server, memprosesnya di sana, lalu meminta Anda memercayai sebuah kebijakan privasi. Yang ini mengerjakannya di peramban yang sudah Anda pakai. Berkas Anda tidak bepergian, tidak ada antrean, tidak ada batas ukuran yang ditetapkan server orang lain, dan tidak ada salinan yang tertinggal di mesin yang tidak Anda kendalikan.'],
        ['Siapa yang membuatnya', 'Situs ini dibangun dan dirawat oleh {publisher}, pengembang independen di {location}. Ini bagian dari keluarga kecil alat berbasis peramban yang dibangun dengan prinsip sama: kerjakan secara lokal, jangan memungut biaya, dan jelaskan dengan jujur cara kerjanya.'],
        ['Bagaimana dibiayai', '{funding}'],
        ['Bahasa', 'Setiap halaman tersedia dalam bahasa Inggris, Spanyol, Portugis, Prancis, Hindi, Indonesia, dan Arab — diterjemahkan, bukan ditukar mesin saat dimuat.'],
        ['Menghubungi', 'Koreksi, laporan bug, dan permintaan fitur diterima di {email}. Laporan yang menyebutkan peramban dan apa yang sedang Anda lakukan bernilai sepuluh kali lipat dibanding yang tidak.'],
      ],
      fundingFree: 'Tidak ada yang dijual di sini. Tidak ada paket berbayar, tidak ada akun, tidak ada tawaran tambahan.',
      fundingAds: 'Iklan di halaman pendukung menutup biaya menjalankannya. Alatnya sendiri tetap gratis, lengkap, dan tanpa batasan — tidak ada versi berbayar, karena tidak ada yang ditahan.',
    },
    contact: {
      title: 'Kontak',
      description: 'Cara menghubungi penerbit {site}: email, alamat pos, dan apa yang perlu ditulis dalam laporan bug.',
      sections: [
        ['Email', 'Tulis ke {email}. Alamat itu sampai ke seorang manusia, bukan sistem tiket, dan itulah tempat yang tepat untuk laporan bug, koreksi, pertanyaan privasi, dan urusan hukum.'],
        ['Apa yang bisa diharapkan', 'Situs ini dijalankan satu orang bersama pekerjaan lain, jadi balasan biasanya butuh beberapa hari. Pesan yang menjelaskan apa yang Anda lakukan, apa yang Anda harapkan, dan apa yang terjadi akan dibalas lebih cepat.'],
        ['Alamat pos', '{publisher}, {location}'],
        ['Melaporkan masalah', 'Jika sebuah hasil tampak salah, kirimkan masukan yang menghasilkannya, peramban yang Anda pakai, dan apa yang Anda harapkan. Karena semuanya berjalan di perangkat Anda, tidak ada log server yang bisa diperiksa siapa pun — penjelasan Anda satu-satunya bukti yang ada.'],
      ],
    },
  },

  ar: {
    ui: { back: 'العودة إلى الأداة', section: 'معلومات الموقع', updated: 'آخر تحديث: {date}' },
    privacy: {
      title: 'سياسة الخصوصية',
      description: 'ما يجمعه {site} وما لا يجمعه. تعمل الأداة في متصفحك ولا تغادر ملفاتك جهازك أبدًا.',
      sections: [
        ['من يدير هذا الموقع', 'يدير هذا الموقع {publisher}، ناشر فرد مقيم في {location}. لأي أمر يخص هذه الصفحة، راسل {email}.'],
        ['باختصار', 'كل ما تضعه في الأداة يبقى على جهازك. تعالجه شيفرة تعمل داخل متصفحك ولا يُرسل إلى خادم أبدًا، لأنه لا يوجد خادم أصلًا: هذا موقع ثابت، والصفحات التي تقرأها ملفات.'],
        ['ما يُحفظ على جهازك', 'تُحفظ إعداداتك وتفضيلاتك في التخزين المحلي للمتصفح كي تتذكّرها الأداة في المرة القادمة. لا تغادر جهازك أبدًا، وتُمحى عند مسح بيانات المتصفح. ولا يدخل فيها شيء مما تُدخله في الأداة.'],
        ['التحليلات', '{analytics}'],
        ['الإعلانات وملفات تعريف الارتباط', '{advertising}'],
        ['حقوقك', 'بما أن هذا الموقع لا يحتفظ بأي بيانات شخصية عنك على أي خادم، فليس لدينا ما نصدّره أو نصحّحه أو نحذفه عند الطلب. أما البيانات التي تحتفظ بها Google عبر الإعلانات أو التحليلات فاستخدم أدوات التحكم الخاصة بها على policies.google.com/technologies/partner-sites. وإن كنت في الاتحاد الأوروبي أو المملكة المتحدة أو الهند، فتبقى لك كل الحقوق التي يمنحها قانونك، ويمكنك المراسلة على العنوان أعلاه لممارستها.'],
        ['الأطفال', 'هذه الأدوات ليست موجهة إلى الأطفال ولا تجمع معلومات عن أحد عن قصد.'],
        ['التغييرات', 'إذا تغيّرت هذه السياسة، تغيّر التاريخ أعلاه معها.'],
      ],
      analyticsOff: 'لا يستخدم هذا الموقع أي تحليلات. لا يوجد أي سكربت قياس في أي صفحة، ولا يُحفظ أي سجل لزيارتك.',
      analyticsOn: 'يستخدم هذا الموقع Google Analytics لإحصاء مشاهدات الصفحات والأدوات المستخدمة، كي يذهب الجهد إلى حيث يحتاجه الناس فعلًا. تُخفى عناوين IP وتُعطَّل إشارات الإعلانات. ولا يُرسل إلى Google أي شيء مما تكتبه في الأداة — لا محتواه ولا طوله ولا بصمته.',
      adsOff: 'لا يعرض هذا الموقع أي إعلانات ولا يضع أي ملفات تعريف ارتباط إعلانية.',
      adsOn: 'تموّل هذا الموقع إعلانات من Google AdSense. تستخدم Google وشركاؤها ملفات تعريف الارتباط وتقنيات مشابهة لعرضها وقياسها، أي أنها قد تقرأ وتكتب ملفات تعريف ارتباط على جهازك. وتصلها عنوان الصفحة وموقعك التقريبي ونوع جهازك — ولا يصلها أبدًا ما كتبته في الأداة، فهو لا يغادر متصفحك. يمكنك التحكم في ذلك عبر adssettings.google.com، ويُطلب من زوار المنطقة الاقتصادية الأوروبية والمملكة المتحدة الموافقة قبل وضع أي ملف من هذا النوع.',
    },
    terms: {
      title: 'شروط الاستخدام',
      description: 'شروط استخدام {site}: مجاني للاستخدام الشخصي والتجاري، يُقدّم كما هو وبلا أي ضمان.',
      sections: [
        ['استخدام الموقع', 'يمكنك استخدام هذه الأدوات لأي غرض مشروع، بما في ذلك العمل التجاري، بلا حساب ولا رسوم ترخيص ولا حاجة إلى الإسناد. والناتج ملك لك.'],
        ['بلا ضمان', 'تُقدَّم الأدوات كما هي. هي مُختبَرة، لكن لا يخلو برنامج من العيوب، وقد تُخطئ الحاسبة أو المحوّل أو المولّد. تحقّق مما يهم قبل الاعتماد عليه — خصوصًا الأرقام المستخدمة لأغراض ضريبية أو ائتمانية أو قانونية. ولا يتحمّل {publisher} أي مسؤولية عن خسارة ناتجة عن استخدام هذا الموقع، إلى أقصى حد يسمح به القانون.'],
        ['ملفاتك مسؤوليتك', 'لأن المعالجة تجري في متصفحك، لا يُرفع شيء ولا يُنسخ احتياطيًا شيء. وإذا أُغلق المتصفح في منتصف العمل، ضاع العمل. احتفظ بنسخك الأصلية.'],
        ['التوفّر', 'هذا موقع مجاني وقد يتغيّر أو ينتقل أو يُغلق في أي وقت ودون إشعار.'],
        ['الملكية الفكرية', 'تصميم الموقع ونصوصه وشيفرته ملك لـ {publisher}. أما ما تعالجه به فيبقى ملكك بالكامل، ولا يُدَّعى عليه شيء.'],
        ['القانون الحاكم', 'تخضع هذه الشروط لقوانين {country}، وتختص محاكم {forum} حصريًا بأي نزاع.'],
      ],
    },
    about: {
      title: 'نبذة',
      description: 'من يصنع {site}، ولماذا يعمل بالكامل داخل متصفحك دون رفع ملفاتك إلى أي خادم.',
      sections: [
        ['ما هذا', '{intro}'],
        ['لماذا يعمل داخل متصفحك', 'معظم الأدوات المجانية من هذا النوع ترفع ملفك إلى خادم، وتعالجه هناك، وتطلب منك الوثوق بسياسة خصوصية. أما هذه فتؤدي العمل في المتصفح الذي تستخدمه أصلًا. ملفك لا يسافر، ولا طابور انتظار، ولا حدّ لحجم يفرضه خادم شخص آخر، ولا نسخة تبقى على جهاز لا تتحكم فيه.'],
        ['من يصنعه', 'يبني هذا الموقع ويعتني به {publisher}، مطوّر مستقل في {location}. وهو واحد من عائلة صغيرة من الأدوات التي تعمل في المتصفح وبُنيت على المبدأ نفسه: أنجز العمل محليًا، لا تتقاضَ شيئًا، واشرح بصدق كيف يعمل.'],
        ['كيف يُموَّل', '{funding}'],
        ['اللغات', 'كل صفحة متاحة بالإنجليزية والإسبانية والبرتغالية والفرنسية والهندية والإندونيسية والعربية — مترجمة، لا مُبدَّلة آليًا عند التحميل.'],
        ['للتواصل', 'التصحيحات وتقارير الأخطاء وطلبات الميزات مرحَّب بها على {email}. والتقرير الذي يذكر المتصفح وما كنت تفعله يساوي عشرة تقارير لا تذكر ذلك.'],
      ],
      fundingFree: 'لا يُباع هنا شيء. لا خطة مدفوعة ولا حساب ولا عروض إضافية.',
      fundingAds: 'الإعلانات في الصفحات المساندة تغطي تكلفة التشغيل. أما الأداة نفسها فتبقى مجانية وكاملة وبلا قيود — لا توجد نسخة مدفوعة، لأنه لا شيء محجوب.',
    },
    contact: {
      title: 'اتصل بنا',
      description: 'كيف تصل إلى ناشر {site}: البريد الإلكتروني والعنوان البريدي وما ينبغي ذكره في تقرير الخطأ.',
      sections: [
        ['البريد الإلكتروني', 'راسل {email}. يصل هذا العنوان إلى إنسان لا إلى نظام تذاكر، وهو المكان المناسب لتقارير الأخطاء والتصحيحات وأسئلة الخصوصية والأمور القانونية.'],
        ['ما الذي تتوقعه', 'يدير الموقع شخص واحد إلى جانب أعمال أخرى، لذا يستغرق الرد عادةً بضعة أيام. والرسالة التي تصف ما فعلته وما توقّعته وما حدث فعلًا سيأتيها الرد أسرع.'],
        ['العنوان البريدي', '{publisher}, {location}'],
        ['الإبلاغ عن مشكلة', 'إذا بدت نتيجة خاطئة، أرسل المُدخل الذي أنتجها، والمتصفح الذي استخدمته، وما كنت تتوقعه. وبما أن كل شيء يعمل على جهازك، فلا توجد سجلات خادم يراجعها أحد — وصفك هو الدليل الوحيد الموجود.'],
      ],
    },
  },
};
