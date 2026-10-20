import type { Listing } from './types';
export type SeoLanding = {
  slug: string;
  title: string;
  h1: string;
  description: string;
  html: string;
  match: (j: Listing) => boolean;
};
const has = (j: Listing, words: string[]) => {
  const t = ` ${j.title.toLowerCase()} `;
  return words.some((w) => t.includes(w));
};
/** Title, topic and policy tags only — never invented vacancies. */
const sectorHas = (j: Listing, words: string[]) => {
  const t = ` ${[j.title, j.topic, ...(j.policyTags || [])].join(' ').toLowerCase()} `;
  return words.some((w) => t.includes(w));
};
export const SEO_LANDINGS: SeoLanding[] = [
  {
    slug: 'communications-jobs-brussels',
    title: 'Communications Jobs in Brussels',
    h1: 'Communications jobs in Brussels (EU affairs)',
    description:
      'Find communications and PR jobs in Brussels EU affairs — press, social, content and events roles on EUJobs.',
    html: '<p>In the Brussels bubble, communications is how policy becomes a public story. Organisations need people who can explain complex EU files to journalists, members, supporters and policymakers — through press work, social media, newsletters, websites and events.</p><p>Search here for <strong>communications jobs in Brussels</strong> tied to EU affairs: press officers, digital and social media roles, content and editorial posts, events and campaigns support, and combined policy-and-comms profiles that are common in smaller NGOs and associations.</p><h3>Skills that show up again and again</h3><p>Strong writing and editing in English are non-negotiable for most roles. French (or Dutch/German depending on the audience) opens doors for local media and bilingual organisations. Experience with CMS tools, analytics, audiovisual content or community management is increasingly listed. Policy literacy helps: you do not need to be a lawyer, but you should be able to read a legislative file and turn it into a clear message.</p><p>Employers include NGOs, trade associations, think tanks, EU institutions and agencies, consultancies, and political groups. Job titles vary — communications officer, media relations manager, digital engagement lead, impact or campaign communicator — so read the responsibilities, not only the label.</p><h3>Where to look on EUJobs</h3><p>Use this landing page alongside the <a href="/categories/media">media &amp; communications category</a> and the wider <a href="/brussels">jobs in Brussels</a> hub. People who mix advocacy and messaging often also browse <a href="/public-affairs-jobs-brussels">public affairs</a> and <a href="/ngo-jobs">NGO jobs</a>. Traineeship-level comms roles appear under <a href="/eu-traineeships-brussels">EU traineeships in Brussels</a>.</p><p>Create <a href="/alerts">job alerts</a> if you want new communications vacancies by email. Organisations hiring communicators can <a href="/submit?kind=job&amp;plan=basic">post a job</a>.</p>',
    match: (j) =>
      j.categorySlug === 'media' ||
      has(j, [
        'communication',
        'press',
        'media',
        'social media',
        'content',
        'editor',
        'campaign',
        'events',
      ]),
  },
  {
    slug: 'digital-policy-jobs-brussels',
    title: 'Digital & AI Policy Jobs in Brussels',
    h1: 'Digital and AI policy jobs in Brussels',
    description:
      'Find digital and AI policy jobs in Brussels — tech advocacy, platform regulation and data roles listed on EUJobs.',
    html: '<p>Digital and AI regulation has become one of the busiest files in Brussels. Companies, trade associations, NGOs, think tanks and consultancies all hire people who can follow platform, data, cybersecurity and artificial intelligence rules — and explain what those rules mean for members or clients.</p><p>This landing page targets searches for <strong>digital policy jobs in Brussels</strong> and related AI or tech advocacy roles. You will see vacancies such as digital policy officer, tech public affairs manager, AI governance adviser, and junior consultants covering the digital portfolio.</p><h3>What the work involves</h3><p>Digital policy roles usually combine legislative monitoring (for example files on data, online platforms, AI or cybersecurity) with stakeholder mapping, drafting positions, and attending expert groups or parliamentary meetings. Some posts are specialised (privacy counsel, standardisation, industrial tech); others sit in a general public affairs team with digital as the main account.</p><p>Helpful backgrounds include EU law, political science, computer science with policy interest, or prior work in a tech company EU affairs team. You do not always need to code, but you do need to understand the technology enough to brief non-specialists accurately. English is required; additional languages help for national association networks.</p><h3>Browse related EUJobs pages</h3><p>Pair this page with <a href="/eu-policy">EU policy jobs</a> and <a href="/public-affairs-jobs-brussels">public affairs jobs in Brussels</a>. Association-side digital files often appear under <a href="/trade-association-jobs-brussels">trade association jobs</a>. Consultancy digital accounts are listed with <a href="/eu-consultancy-jobs">EU consultancy jobs</a>. For a location-wide view, use <a href="/brussels">jobs in Brussels</a>.</p><p>Set <a href="/alerts">alerts</a> for “digital”, “AI” or “tech policy”. Organisations hiring on these files can <a href="/submit?kind=job&amp;plan=basic">post a job</a>.</p>',
    match: (j) =>
      has(j, [
        'digital',
        'tech',
        ' ai ',
        'ai policy',
        'artificial intelligence',
        'data',
        'cyber',
        'platform',
      ]),
  },
  {
    slug: 'eu-affairs-jobs-brussels',
    title: 'EU Affairs Jobs in Brussels',
    h1: 'EU affairs jobs in Brussels',
    description:
      'Browse EU affairs jobs in Brussels — policy, institutions, NGOs, associations and consultancies. Apply direct on EUJobs.',
    html: '<p>Brussels is where European policy is written, negotiated and explained. If you are looking for <strong>EU affairs jobs in Brussels</strong>, you are usually searching across several employer types at once: the EU institutions and agencies, permanent representations and embassies, NGOs and civil society networks, trade associations, think tanks, and public affairs consultancies.</p><p>EUJobs brings those openings into one board so you can compare roles without hopping between dozens of career pages. Listings cover policy officers and advisers, public affairs consultants, communications and advocacy posts, programme and membership roles, and entry-level traineeships. Each vacancy links through to the employer’s own application process.</p><h3>What “EU affairs” usually means in practice</h3><p>In Brussels, “EU affairs” is less a single job title and more a family of work. Common patterns include:</p><ul><li><strong>Policy monitoring and analysis</strong> — tracking Commission proposals, Parliament amendments and Council positions, then briefing colleagues or members.</li><li><strong>Advocacy and stakeholder engagement</strong> — meetings with policymakers, coalition work, and position papers.</li><li><strong>Association and membership management</strong> — running working groups, events and member communications for sector groups.</li><li><strong>Consultancy delivery</strong> — client briefings, intelligence notes and advocacy support for companies or associations.</li></ul><p>Languages matter. English is the working language in most EU-bubble offices; French (and sometimes Dutch or German) is a frequent advantage for local administration, events and bilateral outreach. Many employers state language requirements clearly in the advert — read them before you apply.</p><h3>How to use this page</h3><p>Start with the live vacancies below (or on our main <a href="/brussels">jobs in Brussels</a> hub). Filter by organisation type if you already know whether you want an NGO, association, think tank or consultancy path. If you are earlier in your career, also check <a href="/categories/traineeships">traineeships</a>. Employers can <a href="/submit?kind=job&amp;plan=basic">post a job</a> to reach candidates who are actively looking for EU affairs roles.</p><p>Subscribe to <a href="/alerts">free job alerts</a> if you want new Brussels EU affairs listings by email rather than checking the board every day.</p>',
    match: (j) =>
      [
        'eu-institutions',
        'eu-agencies',
        'ngos',
        'trade-associations',
        'think-tanks',
        'public-affairs',
      ].includes(j.categorySlug || '') ||
      has(j, ['eu affairs', 'european affairs', 'policy', 'advocacy', 'public affairs']),
  },
  {
    slug: 'eu-consultancy-jobs',
    title: 'EU Public Affairs Consultancy Jobs',
    h1: 'EU public affairs consultancy jobs',
    description:
      'Browse EU public affairs consultancy jobs in Brussels — junior consultants, advisers and directors. Apply via EUJobs.',
    html: '<p>Public affairs consultancies in Brussels advise companies, associations and campaigns on EU regulation and political risk. If you are looking for <strong>EU consultancy jobs</strong> or public affairs consultant roles, expect work that mixes intelligence gathering, client counselling, advocacy support and business development as you progress.</p><p>Junior posts often focus on monitoring, note-taking at hearings, drafting weekly updates and helping prepare meetings. Mid-level consultants own client workstreams and files. Directors lead accounts, win new business and set the firm’s positioning on major dossiers such as digital, energy, health or financial services.</p><h3>What employers usually look for</h3><ul><li>Understanding of the EU legislative process and how the Commission, Parliament and Council interact.</li><li>Clear writing in English; French or another EU language is frequently an asset.</li><li>Comfort with deadlines, multiple clients and confidential information.</li><li>For senior roles: a track record in advocacy, institutions, associations or a related consultancy.</li></ul><p>Traineeships and junior consultant vacancies are a common entry route. Some firms hire people who have already done association or NGO policy work; others prefer recent graduates with strong monitoring skills.</p><h3>Using EUJobs for consultancy search</h3><p>Filter for consultancy and public affairs listings on this page and on <a href="/public-affairs-jobs-brussels">public affairs jobs in Brussels</a>. Compare with <a href="/trade-association-jobs-brussels">trade association</a> and <a href="/eu-policy">EU policy</a> roles if you are deciding between in-house advocacy and agency life. Early-career candidates should also check <a href="/eu-traineeships-brussels">EU traineeships in Brussels</a>.</p><p>Agencies can <a href="/submit?kind=job&amp;plan=basic">post a job</a> to reach candidates already browsing EU affairs openings. Jobseekers can set <a href="/alerts">alerts</a> for “consultant” or “public affairs”.</p>',
    match: (j) =>
      j.categorySlug === 'public-affairs' ||
      has(j, ['consultant', 'consultancy', 'account manager', 'account director']),
  },
  {
    slug: 'eu-traineeships-brussels',
    title: 'EU Traineeships in Brussels',
    h1: 'EU traineeships and internships in Brussels',
    description:
      'Find EU traineeships and paid internships in Brussels — NGOs, associations, think tanks and consultancies. Updated on EUJobs.',
    html: '<p>A Brussels traineeship is still one of the most common ways into the EU bubble. Beyond the well-known institutional programmes, many NGOs, trade associations, think tanks and public affairs consultancies hire trainees every year — often under Belgian CIP (<em>convention d’immersion professionnelle</em>) or similar paid internship contracts.</p><p>This page collects <strong>EU traineeship and internship openings in Brussels</strong> listed on EUJobs. Roles typically involve legislative monitoring, drafting short briefings, supporting events, updating stakeholder lists, and shadowing senior colleagues in meetings. Titles vary: trainee, intern, junior fellow, or “CIP” — read the contract type and allowance carefully.</p><h3>What to check before you apply</h3><ul><li><strong>Eligibility</strong> — Some CIP roles require that you have not already completed a CIP in Belgium and are not currently enrolled at university. Institutional programmes have their own nationality and degree rules.</li><li><strong>Pay and hours</strong> — Many Brussels traineeships are paid; amounts differ by organisation. The advert should state the monthly allowance and whether meal vouchers or transport support are included.</li><li><strong>Languages</strong> — English is almost always required. French is frequently useful; other EU languages can be decisive for MEP offices or national associations.</li><li><strong>Start date and length</strong> — Six months is common; some offers allow extension. Confirm whether the role is on-site, hybrid, or remote-friendly.</li></ul><h3>Institutional vs bubble traineeships</h3><p>Institutional schemes (for example Commission Blue Book or Parliament Schuman traineeships) run on fixed calendars and central applications. Bubble traineeships — NGOs, associations, consultancies — open year-round and are posted as ordinary vacancies. EUJobs focuses on the latter while still surfacing institutional trainee posts when employers list them on the board.</p><p>Browse current openings below, or start from our <a href="/categories/traineeships">traineeships category</a>. For broader Brussels search, see <a href="/brussels">jobs in Brussels</a>. New graduates often combine a traineeship search with <a href="/eu-policy">EU policy</a> and <a href="/public-affairs-jobs-brussels">public affairs</a> filters once they know which path fits.</p><p>Set up <a href="/alerts">job alerts</a> with “traineeship” or “intern” in your preferences so you hear about new Brussels placements as they go live.</p>',
    match: (j) =>
      j.employmentType === 'Traineeship' ||
      j.categorySlug === 'traineeships' ||
      has(j, ['intern', 'trainee', 'traineeship', 'stagiaire', 'blue book', 'cip']),
  },
  {
    slug: 'policy-advocacy-jobs-brussels',
    title: 'Policy & Advocacy Jobs in Brussels',
    h1: 'Policy and advocacy jobs in Brussels',
    description:
      'Browse policy and advocacy jobs in Brussels — officers, advisers and campaign roles across the EU bubble on EUJobs.',
    html: '<p>Policy and advocacy is the core craft of the Brussels EU bubble: understanding what the institutions are doing, deciding what your organisation wants, and engaging the people who can change the outcome. If you searched for <strong>Brussels policy jobs</strong> or <strong>policy and advocacy jobs in Brussels</strong>, this page is the dedicated starting point on EUJobs.</p><p>Common titles include policy officer, advocacy officer, policy adviser, campaign director and parliamentary affairs lead. Day-to-day work may involve amending trackers, drafting position papers, meeting MEP assistants, building coalitions, and reporting to boards or members.</p><h3>Sectors that hire advocacy talent</h3><ul><li><strong>NGOs and civil society</strong> — issue campaigns, rights, environment, development and humanitarian advocacy.</li><li><strong>Trade associations</strong> — sector regulation, standards and industrial policy.</li><li><strong>Think tanks</strong> — research-led recommendations and convening.</li><li><strong>Consultancies and in-house EU affairs teams</strong> — client or company advocacy strategies.</li></ul><p>Success usually combines subject knowledge with process knowledge: how trilogues work, who holds the pen on a file, and when a public campaign helps versus when quiet engagement is better. English-language drafting is standard; additional EU languages strengthen outreach.</p><h3>Related searches on EUJobs</h3><p>For a policy-heavy feed without the advocacy label, see <a href="/eu-policy">EU policy jobs</a>. Public affairs and government relations roles sit on <a href="/public-affairs-jobs-brussels">public affairs jobs in Brussels</a>. NGO-focused advocacy is also under <a href="/ngo-jobs">NGO jobs</a>. Newcomers can start with <a href="/eu-traineeships-brussels">EU traineeships in Brussels</a>.</p><p>Keep a <a href="/alerts">job alert</a> running while you refine your CV and shortlist organisations that match your policy files. Employers can <a href="/submit?kind=job&amp;plan=basic">post a policy or advocacy vacancy</a> to reach active Brussels candidates.</p>',
    match: (j) => has(j, ['policy', 'advocacy', 'advocate', 'regulatory', 'legislative']),
  },
  {
    slug: 'think-tank-jobs-brussels',
    title: 'Think Tank Jobs in Brussels',
    h1: 'Think tank jobs in Brussels',
    description:
      'Find think tank jobs in Brussels — research, policy analysis, projects and communications roles listed on EUJobs.',
    html: '<p>Brussels think tanks shape debate on EU and global policy through research papers, events and closed-door roundtables. Vacancies range from research assistants and project officers to unit heads, communications leads and fundraising or membership roles that keep the institute running.</p><p>This page is for people searching <strong>think tank jobs in Brussels</strong>. Typical day-to-day work includes drafting policy briefs, managing research projects and grants, organising conferences, engaging institutional and corporate members, and translating findings for media and policymakers.</p><h3>Who thrives in a Brussels think tank</h3><p>Strong writing and analytical skills matter as much as subject expertise. Many roles ask for a master’s degree in political science, economics, law or a related field, plus evidence you can turn complex files into clear recommendations. Project and fundraising experience is valuable because much of the sector is grant- or membership-funded. Languages: English is essential; French and other EU languages help for outreach and events.</p><p>Career paths often start with a traineeship or junior research post, then move into specialised analyst or project management tracks. Some colleagues later move to institutions, NGOs, associations or consultancies — and vice versa.</p><h3>How EUJobs helps</h3><p>We list think tank openings next to the rest of the EU affairs market so you can see comparable policy and communications roles elsewhere. Browse the live vacancies on this page, or open the <a href="/categories/think-tanks">think tanks category</a>. Cross-check <a href="/eu-policy">EU policy jobs</a> and <a href="/brussels">jobs in Brussels</a> if you want a wider net. For first roles, also scan <a href="/eu-traineeships-brussels">EU traineeships in Brussels</a>.</p><p>Researchers and communications professionals can <a href="/alerts">subscribe to alerts</a>. Institutes looking to hire can <a href="/submit?kind=job&amp;plan=basic">post a vacancy</a>.</p>',
    match: (j) =>
      j.categorySlug === 'think-tanks' ||
      has(j, ['research', 'researcher', 'fellow', 'think tank']),
  },
  {
    slug: 'trade-association-jobs-brussels',
    title: 'Trade Association Jobs in Brussels',
    h1: 'Trade association jobs in Brussels',
    description:
      'Explore trade association and industry federation jobs in Brussels — policy, membership and public affairs roles on EUJobs.',
    html: '<p>European trade associations and industry federations sit at the centre of Brussels advocacy. They represent member companies or national associations toward the EU institutions, run technical working groups, and translate regulation into practical guidance for their sectors.</p><p>If you are searching for <strong>trade association jobs in Brussels</strong>, you will see titles such as policy officer, public affairs manager, membership and partnerships lead, communications officer, and EU affairs adviser. Some roles are deeply technical (energy, chemicals, digital, health, transport); others are horizontal — association management, events and governance.</p><h3>Why association roles differ from consultancy</h3><p>In a trade association you usually work for one sector’s collective interest. The work mixes policy analysis with member service: preparing positions, coordinating input from company experts, organising committees, and speaking with institutional stakeholders. Consultancies advise multiple clients; associations often own a narrower file but deeper member relationships.</p><p>Useful backgrounds include EU studies, law, economics, engineering or the sector itself. Prior experience in a national association, company EU affairs team, or a related traineeship helps. Multilingual CVs are common; English is standard, and another European language is frequently listed as an asset.</p><h3>Finding the right fit</h3><p>EUJobs lists association vacancies alongside NGOs, think tanks and consultancies so you can compare employer types. Use the <a href="/categories/trade-associations">trade associations category</a> for a filtered view, or browse this landing page for Brussels-focused copy and links. Related searches include <a href="/public-affairs-jobs-brussels">public affairs jobs in Brussels</a> and <a href="/climate-jobs">climate and environment jobs</a> when your sector is green regulation.</p><p>Employers hiring for federation roles can <a href="/submit?kind=job&amp;plan=basic">post a job</a>. Candidates who want weekly updates should open <a href="/alerts">free alerts</a>.</p>',
    match: (j) =>
      j.categorySlug === 'trade-associations' ||
      has(j, ['association', 'federation', 'membership']),
  },
  {
    slug: 'energy-policy-jobs-brussels',
    title: 'Energy Policy Jobs in Brussels',
    h1: 'Energy policy jobs in Brussels',
    description:
      'Find energy policy jobs in Brussels — renewables, markets, grids and security of supply roles across the EU bubble on EUJobs.',
    html: '<p>Energy policy is one of the busiest files in the Brussels bubble. The European Commission’s Directorate-General for Energy (DG ENER) steers EU rules on markets, renewables, grids and security of supply, while industry associations, utilities, NGOs, think tanks and public affairs consultancies hire people who can follow those files and explain what they mean for members or clients.</p><p>If you are searching for <strong>energy policy jobs in Brussels</strong>, expect titles such as energy policy officer, public affairs manager (energy), renewables adviser, electricity markets analyst, and junior consultant covering the energy portfolio. Work typically mixes legislative monitoring, stakeholder meetings, drafting briefings or position papers, and supporting events or working groups.</p><h3>What is on the agenda</h3><p>Recent EU energy work has focused on making markets more resilient and accelerating clean power. Revised electricity market design rules entered into force in July 2024, promoting longer-term contracts such as power purchase agreements and two-way contracts for difference. The revised Renewable Energy Directive raised the EU’s binding renewables target for 2030 to at least 42.5%, with an aspiration to reach 45%. Implementation guidance for Member States continues to cover grids, storage, flexibility and network tariffs — so advocacy and association roles often need both political and technical literacy.</p><p>Useful backgrounds include EU law or political science with an energy focus, engineering or economics with policy experience, or prior work in a company EU affairs team. You do not always need to be an engineer, but you do need to understand the system enough to brief non-specialists accurately. English is the working language in most energy offices; French or another EU language helps for national association networks and local events.</p><h3>How to use EUJobs</h3><p>Browse live openings on this page and on our <a href="/brussels">jobs in Brussels</a> hub. Related feeds include <a href="/eu-policy">EU policy jobs</a>, <a href="/public-affairs-jobs-brussels">public affairs jobs in Brussels</a>, and <a href="/climate-jobs">climate jobs</a> where energy and climate files overlap. Association-side energy posts often appear with <a href="/trade-association-jobs-brussels">trade association jobs</a>; consultancy accounts sit under <a href="/eu-consultancy-jobs">EU consultancy jobs</a>.</p><p>Set a free <a href="/alerts">job alert</a> for “energy”, “renewables” or “electricity”. Employers hiring on these files can <a href="/submit?kind=job&amp;plan=basic">post a job</a> to reach candidates who are already filtering for energy policy work.</p>',
    match: (j) =>
      sectorHas(j, ['energy', 'renewable', 'electricity', 'grid', 'hydrogen', 'nuclear']),
  },
  {
    slug: 'health-policy-jobs-brussels',
    title: 'Health Policy Jobs in Brussels',
    h1: 'Health policy jobs in Brussels',
    description:
      'Browse health policy jobs in Brussels — pharma, medical devices, public health and EU advocacy roles listed on EUJobs.',
    html: '<p>Health policy in Brussels sits at the intersection of public health, pharmaceuticals, medical devices and crisis preparedness. The Commission’s Directorate-General for Health and Food Safety (DG SANTE) leads much of the EU’s work toward a stronger European Health Union, while patient groups, industry associations, NGOs, consultancies and in-house EU affairs teams hire people who can follow legislation and engage institutions.</p><p>Search here for <strong>health policy jobs in Brussels</strong>: health policy officer, pharmaceutical affairs adviser, medical devices public affairs manager, EU advocacy lead (health), and junior roles supporting dossier monitoring or stakeholder mapping. Day-to-day work often includes tracking Parliament and Council positions, drafting consultation responses, preparing meetings with policymakers, and briefing members or clients on what a proposal means in practice.</p><h3>Files that shape hiring</h3><p>EU health legislation draws on Treaty bases covering public health, the single market and social policy. Recent priorities include completing the European Health Union, improving access to and availability of medicines, and reducing dependencies for critical medicines. Political agreement on the reform of EU pharmaceutical legislation was reached in December 2025; the Council adopted the new rules in September 2026, with implementation work — including delegated and implementing acts — following in the years after. Digital health, health security and programmes such as EU4Health also keep Brussels teams busy beyond the classic pharma file.</p><p>Helpful profiles combine policy or legal training with sector knowledge (life sciences, public health, health economics) or experience in a company, association or NGO health team. English drafting is standard; additional languages help when coordinating national associations or member organisations.</p><h3>Browse related pages</h3><p>Pair this landing with <a href="/eu-policy">EU policy jobs</a> and <a href="/policy-advocacy-jobs-brussels">policy and advocacy jobs in Brussels</a>. Industry federation posts often appear under <a href="/trade-association-jobs-brussels">trade association jobs</a>; civil-society health advocacy also sits with <a href="/ngo-jobs">NGO jobs</a>. For a location-wide view, use <a href="/brussels">jobs in Brussels</a>.</p><p>Subscribe to <a href="/alerts">alerts</a> for “health”, “pharma” or “medical devices”. Organisations recruiting on these files can <a href="/submit?kind=job&amp;plan=basic">post a job</a> on EUJobs.</p>',
    match: (j) =>
      sectorHas(j, [
        'health',
        'pharma',
        'pharmaceutical',
        'medical device',
        'medicines',
        'healthcare',
      ]),
  },
  {
    slug: 'environment-climate-policy-jobs-brussels',
    title: 'Climate & Environment Policy Jobs Brussels',
    h1: 'Environment and climate policy jobs in Brussels',
    description:
      'Find climate and environment policy jobs in Brussels — Green Deal, carbon and nature advocacy roles on EUJobs.',
    html: '<p>Climate and environment policy is a defining Brussels beat. The Commission’s Directorate-General for Climate Action (DG CLIMA) leads work toward climate neutrality and the 2030 emissions targets; the Directorate-General for Environment (DG ENV) covers biodiversity, pollution, circular economy and related environmental files. Around them, NGOs, industry associations, think tanks, consultancies and company EU affairs teams hire people who can turn complex Green Deal legislation into clear positions and campaigns.</p><p>If you searched for <strong>environment and climate policy jobs in Brussels</strong>, this page gathers roles such as climate policy officer, environment advocacy adviser, CBAM or carbon markets specialist, circular economy officer, and public affairs consultants covering the green portfolio.</p><h3>The policy context (without the hype)</h3><p>Under the European Climate Law, the EU has a legally binding commitment to climate neutrality by 2050 and a target to cut greenhouse gas emissions by at least 55% by 2030 compared with 1990 levels. The Fit for 55 package translates those goals into sectoral legislation. The Carbon Border Adjustment Mechanism (CBAM) — covering carbon-intensive imports such as iron and steel, cement, fertilisers, aluminium, electricity and hydrogen — became fully operational on 1 January 2026. Hiring often follows implementation: monitoring secondary legislation, Member State practice, and how trade, industrial and energy files interact with climate rules.</p><p>Strong candidates usually understand the legislative process (Commission, Parliament, Council and trilogues) and can write clearly in English. Subject depth — climate science literacy, environmental law, economics or prior NGO/association experience — matters more than a single “green” job title. French or another EU language is a frequent asset for coalition work.</p><h3>Related EUJobs pages</h3><p>Use this page alongside <a href="/climate-jobs">climate jobs</a> and <a href="/eu-policy">EU policy jobs</a>. Energy-adjacent openings also appear under <a href="/energy-policy-jobs-brussels">energy policy jobs in Brussels</a>. Advocacy-heavy NGO posts sit with <a href="/ngo-advocacy-jobs-brussels">NGO advocacy jobs in Brussels</a> and <a href="/ngo-jobs">NGO jobs</a>. For consultancies and associations, see <a href="/eu-consultancy-jobs">EU consultancy jobs</a> and <a href="/trade-association-jobs-brussels">trade association jobs</a>.</p><p>Set <a href="/alerts">job alerts</a> for “climate”, “environment” or “Green Deal”. Employers can <a href="/submit?kind=job&amp;plan=basic">post a vacancy</a> to reach candidates filtering for these files.</p>',
    match: (j) =>
      sectorHas(j, [
        'climate',
        'environment',
        'biodiversity',
        'sustainability',
        'green deal',
        'circular',
        'decarbon',
      ]),
  },
  {
    slug: 'financial-services-policy-jobs-brussels',
    title: 'Financial Services Policy Jobs Brussels',
    h1: 'Financial services policy jobs in Brussels',
    description:
      'Browse financial services policy jobs in Brussels — banking, capital markets, digital and sustainable finance roles on EUJobs.',
    html: '<p>Financial services policy is a specialised corner of the Brussels EU bubble. The Commission’s Directorate-General for Financial Stability, Financial Services and Capital Markets Union (DG FISMA) develops EU rules on banking, capital markets, financial crime, sustainable finance and digital finance. Banks, insurers, asset managers, fintech firms, trade associations, NGOs and consultancies hire people who can track those files and represent their organisation toward the institutions.</p><p>Looking for <strong>financial services policy jobs in Brussels</strong>? Common titles include financial services policy officer, public affairs manager (banking or capital markets), sustainable finance adviser, digital finance advocate, and regulatory affairs consultant. Work usually combines monitoring legislative and technical standards work, drafting positions, engaging MEPs and Member State attachés, and translating regulatory detail into member or client briefings.</p><h3>What the files cover</h3><p>DG FISMA’s mission centres on a resilient financial system that supports growth, competitiveness and the digital and green transitions. Long-running projects include deepening capital markets so savings and investment can flow more easily across the EU (the Capital Markets Union agenda, often discussed alongside a Savings and Investments Union framing) and completing the Banking Union. Sustainable finance and digital finance strategies remain active hiring drivers: taxonomy and disclosure work on one side, crypto-assets and payments on the other. Roles may also touch anti-money laundering, sanctions-related work or supervisory convergence — always check the vacancy for the exact portfolio.</p><p>Employers typically look for EU process knowledge plus sector fluency — law, economics, finance or prior experience in a bank, association or consultancy regulatory team. Precise English writing is essential; French or another EU language helps for national networks.</p><h3>Where else to look on EUJobs</h3><p>Cross-check <a href="/eu-finance-jobs">EU finance jobs</a>, <a href="/eu-policy">EU policy jobs</a> and <a href="/public-affairs-jobs-brussels">public affairs jobs in Brussels</a>. Association vacancies appear under <a href="/trade-association-jobs-brussels">trade association jobs</a>; consultancy accounts under <a href="/eu-consultancy-jobs">EU consultancy jobs</a>. City-wide browsing: <a href="/brussels">jobs in Brussels</a>.</p><p>Use <a href="/alerts">alerts</a> for “financial services”, “banking”, “capital markets” or “sustainable finance”. Hiring organisations can <a href="/submit?kind=job&amp;plan=basic">post a job</a> on EUJobs.</p>',
    match: (j) =>
      sectorHas(j, [
        'financial',
        'banking',
        'insurance',
        'capital market',
        'fintech',
        'asset management',
        'payment',
      ]),
  },
  {
    slug: 'agriculture-food-policy-jobs-brussels',
    title: 'Agriculture & Food Policy Jobs Brussels',
    h1: 'Agriculture and food policy jobs in Brussels',
    description:
      'Find agriculture and food policy jobs in Brussels — CAP, food systems and agri-food advocacy roles on EUJobs.',
    html: '<p>Agriculture and food policy remains a permanent Brussels specialism. The Common Agricultural Policy (CAP) is still one of the EU’s largest shared policies; food safety, labelling, animal welfare and supply-chain rules sit alongside it under Commission departments such as DG AGRI and DG SANTE. Farmer organisations, food and drink federations, retailers, NGOs, think tanks and consultancies all hire people who can follow CAP reform, market organisation rules and food-system legislation.</p><p>Search for <strong>agriculture and food policy jobs in Brussels</strong> and you will see titles like agricultural policy officer, food policy adviser, CAP specialist, animal welfare advocacy officer, and public affairs roles covering agri-food. Work typically involves monitoring Commission proposals and Parliament amendments, coordinating member input, drafting positions, and engaging AGRIFISH attachés or relevant MEPs.</p><h3>Policy context worth knowing</h3><p>For 2023–2027, CAP delivery relies on national CAP Strategic Plans rather than a single Brussels-written rural development template — so roles often need both EU-level and Member State awareness. In February 2025 the Commission published its Vision for Agriculture and Food, setting direction toward 2040 with emphasis on competitiveness, resilience, fairer remuneration for farmers, simplification and generational renewal. Follow-up work has included CAP simplification packages, updates on unfair trading practices, and related strategies on water resilience, bioeconomy and livestock. Earlier Farm to Fork initiatives still shape stakeholder debate, but the live agenda is implementation, simplification and the next financing period — not a single slogan.</p><p>Useful backgrounds include agricultural economics, EU law, political science, food science or prior work in a national ministry, cooperative, association or NGO. English is standard; languages spoken in major producer Member States are a practical advantage.</p><h3>Related pages on EUJobs</h3><p>Combine this feed with <a href="/eu-policy">EU policy jobs</a>, <a href="/policy-advocacy-jobs-brussels">policy and advocacy jobs in Brussels</a> and <a href="/trade-association-jobs-brussels">trade association jobs</a>. Environment-linked agri files may also appear under <a href="/environment-climate-policy-jobs-brussels">environment and climate policy jobs</a>. Location hub: <a href="/brussels">jobs in Brussels</a>.</p><p>Set <a href="/alerts">alerts</a> for “agriculture”, “CAP”, “food policy” or “agri-food”. Employers can <a href="/submit?kind=job&amp;plan=basic">post a job</a> to reach candidates filtering for these dossiers.</p>',
    match: (j) =>
      sectorHas(j, [
        'agriculture',
        'agri-food',
        'agrifood',
        'food policy',
        'fisheries',
        'farm to fork',
        'food safety',
      ]),
  },
  {
    slug: 'trade-policy-jobs-brussels',
    title: 'Trade Policy Jobs in Brussels',
    h1: 'Trade policy jobs in Brussels',
    description:
      'Browse trade policy jobs in Brussels — FTAs, WTO, economic security and market access roles listed on EUJobs.',
    html: '<p>Trade policy is decided in Brussels more than in any single national capital. The European Commission’s Directorate-General for Trade (DG TRADE) negotiates and manages the EU’s common commercial policy — free trade and association agreements, WTO work, trade defence and an expanding economic-security agenda. Companies, sector federations, NGOs, think tanks and consultancies hire people who can follow negotiations, explain tariff and non-tariff issues, and engage institutions and Member States.</p><p>If you want <strong>trade policy jobs in Brussels</strong>, look for titles such as trade policy officer, market access adviser, trade and sustainable development specialist, economic security analyst, and public affairs consultant covering trade. Day-to-day work may include reading negotiating texts and Council mandates, preparing stakeholder positions, tracking ratification debates in the European Parliament, and briefing members on what a deal or defence measure means for their sector.</p><h3>What “trade” means in practice</h3><p>The Commission presents the EU as holding a large network of preferential trade agreements — publicly cited as 45 agreements with 80 partners — used to open markets, support supply-chain resilience and pursue sustainability chapters alongside market access. WTO rules remain the baseline for much of EU trade; preferential deals build on that system. Roles increasingly mix classical FTA work with economic security themes: critical raw materials, investment screening interfaces, sanctions awareness, and tools against unfair trade. CBAM and other Green Deal instruments also create trade-adjacent advocacy work for industrial and climate teams.</p><p>Strong candidates understand how the Commission negotiates under Council mandates and how Parliament consent fits at the end of a deal. Backgrounds in international economics, EU or international law, political science or prior association/company trade work are common. Clear English writing is essential; languages of major trading partners or Member States are useful extras.</p><h3>Browse with related EUJobs pages</h3><p>Use <a href="/eu-policy">EU policy jobs</a> and <a href="/public-affairs-jobs-brussels">public affairs jobs in Brussels</a> for adjacent openings. Industry federation trade files often sit under <a href="/trade-association-jobs-brussels">trade association jobs</a>. Climate-linked border measures may also appear on <a href="/environment-climate-policy-jobs-brussels">environment and climate policy jobs</a>. City-wide: <a href="/brussels">jobs in Brussels</a>.</p><p>Set <a href="/alerts">alerts</a> for “trade”, “FTA”, “market access” or “WTO”. Organisations hiring on trade files can <a href="/submit?kind=job&amp;plan=basic">post a job</a>.</p>',
    match: (j) => sectorHas(j, ['trade', 'customs', 'tariff', 'market access', 'wto']),
  },
  {
    slug: 'eu-funding-project-management-jobs-brussels',
    title: 'EU Funding & Project Jobs Brussels',
    h1: 'EU funding and project management jobs in Brussels',
    description:
      'Find EU funding and project management jobs in Brussels — Horizon Europe, LIFE, grants and consortium roles on EUJobs.',
    html: '<p>Not every Brussels job is advocacy. Many NGOs, associations, research centres, consultancies and networks run on EU grants — and they hire people who can write proposals, manage consortia, report to executive agencies and keep deliverables on time. If you searched for <strong>EU funding and project management jobs in Brussels</strong>, this page is the dedicated starting point on EUJobs.</p><p>Typical titles include EU project officer, EU project manager, grants and fundraising officer, research project officer, programme coordinator and financial reporting specialist for EU projects. The work mixes proposal development, partner coordination, work-package delivery, event organisation, technical and financial reporting, and compliance with grant agreements.</p><h3>Programmes you will see in vacancy notices</h3><p>Horizon Europe remains the flagship research and innovation programme and appears constantly in Brussels project-role requirements. Environment and climate projects often cite LIFE; health consortia frequently mention EU4Health (calls published via HaDEA). Other notices reference Erasmus+, digital or infrastructure-related programmes, or executive agencies such as CINEA for climate, energy and transport-linked implementation. Employers usually ask for prior experience with at least one of these programmes, comfort with EU reporting templates, and the ability to work English-first across multinational consortia.</p><p>You do not need to be a policymaker, but policy literacy helps when deliverables include stakeholder workshops or dissemination aimed at EU institutions. Strong organisation, Excel and document control skills matter as much as subject expertise. Additional EU languages help when partners or national contact points work outside English.</p><h3>Related searches on EUJobs</h3><p>Project roles in civil society often sit next to <a href="/ngo-jobs">NGO jobs</a> and <a href="/ngo-advocacy-jobs-brussels">NGO advocacy jobs in Brussels</a>. Research-heavy posts appear with <a href="/think-tank-jobs-brussels">think tank jobs in Brussels</a>. For policy careers rather than grants, see <a href="/eu-policy">EU policy jobs</a>. Location hub: <a href="/brussels">jobs in Brussels</a>. Newcomers can also check <a href="/eu-traineeships-brussels">EU traineeships in Brussels</a>.</p><p>Set <a href="/alerts">alerts</a> for “Horizon”, “project officer”, “grants” or “EU funding”. Organisations recruiting project talent can <a href="/submit?kind=job&amp;plan=basic">post a job</a>.</p>',
    match: (j) =>
      sectorHas(j, [
        'funding',
        'grant',
        'horizon',
        'project manager',
        'project management',
        'tender',
      ]),
  },
  {
    slug: 'ngo-advocacy-jobs-brussels',
    title: 'NGO Advocacy Jobs in Brussels',
    h1: 'NGO advocacy jobs in Brussels',
    description:
      'Browse NGO advocacy jobs in Brussels — campaign, policy and civil society EU affairs roles listed on EUJobs.',
    html: '<p>Brussels hosts one of the densest civil-society advocacy scenes in Europe. Environmental, human rights, development, health, digital rights and consumer organisations maintain EU offices to follow legislation, build coalitions and speak to the Commission, Parliament and Council. If you are looking for <strong>NGO advocacy jobs in Brussels</strong>, you want roles that combine policy analysis with campaigning and stakeholder engagement — not only generic NGO administration.</p><p>Common titles include advocacy officer, policy and advocacy manager, campaigner, EU affairs officer (NGO), parliamentary liaison and communications-advocacy hybrids in smaller teams. Daily work can mean amendment trackers, position papers, joint letters, meetings with MEP assistants, social media moments timed to votes, and reporting to boards or funders.</p><h3>How advocacy work is organised</h3><p>Interest representation toward the EU institutions is a recognised part of democratic policymaking. Organisations that meet decision-makers directly are expected to appear in the EU Transparency Register, the public database set up under the 2021 interinstitutional agreement between Parliament, Council and Commission. Registration is de facto required for many forms of institutional access. Separately, many Brussels NGOs also manage EU-funded projects (for example under Horizon Europe, LIFE or EU4Health); some vacancies blend advocacy with grant delivery — clarify which mix you want before you apply.</p><p>Success usually needs subject expertise plus process knowledge: who holds the pen on a file, when a public campaign helps, and when quiet engagement is better. Strong English writing is non-negotiable; French or another EU language strengthens coalition and member outreach. Prior campaign, research or association experience often outweighs a perfect academic pedigree.</p><h3>Related EUJobs pages</h3><p>For a broader NGO feed, use <a href="/ngo-jobs">NGO jobs</a>. Policy craft without the NGO filter sits on <a href="/policy-advocacy-jobs-brussels">policy and advocacy jobs in Brussels</a> and <a href="/eu-policy">EU policy jobs</a>. Grant-heavy roles are gathered under <a href="/eu-funding-project-management-jobs-brussels">EU funding and project management jobs</a>. Climate and environment advocacy also appears on <a href="/environment-climate-policy-jobs-brussels">environment and climate policy jobs</a>. City hub: <a href="/brussels">jobs in Brussels</a>.</p><p>Keep <a href="/alerts">job alerts</a> running for “advocacy”, “campaign” or your issue area. NGOs hiring can <a href="/submit?kind=job&amp;plan=basic">post a job</a> to reach active Brussels candidates.</p>',
    match: (j) =>
      j.categorySlug === 'ngos' || sectorHas(j, ['advocacy', 'civil society', 'ngo', 'campaign']),
  },
];
export const getSeoLanding = (slug: string) => SEO_LANDINGS.find((p) => p.slug === slug) || null;
