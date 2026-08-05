/**
 * The Prophet ﷺ in outline.
 *
 * Everything else in this project is derived from the corpus: parsed from the
 * chains, matched against the rijāl literature, counted. This is not. It is
 * written here, from the standard sīra, because the alternative was a panel
 * that answered "who is this?" with "the origin of every chain" and then listed
 * four hundred and sixty hadith references that are simply all of them.
 *
 * Kept to what the sīra literature agrees on. Where the sources differ — the
 * exact year of a birth reckoned before the calendar existed, the status of
 * Māriya — this says so rather than picking. Nothing here is a ruling on
 * anything; it is the frame a reader needs to make sense of the graph beneath.
 */

export interface SiraSection {
  heading: string;
  /** Free prose, one paragraph per entry. */
  prose?: string[];
  /** Label/value pairs, for anything that is really a list. */
  rows?: { label: string; value: string }[];
  /** A dated sequence — campaigns, journeys. */
  events?: { when: string; what: string; note?: string }[];
}

export const SIRA: SiraSection[] = [
  {
    heading: 'Name and lineage',
    prose: [
      'Muḥammad ibn ʿAbd Allāh ibn ʿAbd al-Muṭṭalib ibn Hāshim ibn ʿAbd Manāf, of the clan of Hāshim and the tribe of Quraysh, whose line the Arab genealogists trace to Ismāʿīl ibn Ibrāhīm.',
    ],
    rows: [
      { label: 'Father', value: 'ʿAbd Allāh ibn ʿAbd al-Muṭṭalib, who died before his birth' },
      { label: 'Mother', value: 'Āmina bint Wahb, who died when he was six' },
      { label: 'Raised by', value: 'his grandfather ʿAbd al-Muṭṭalib, then his uncle Abū Ṭālib' },
      { label: 'Born', value: 'Mecca, the Year of the Elephant — reckoned to about 570 CE' },
    ],
  },
  {
    heading: 'Before prophethood',
    prose: [
      'He was known in Mecca as al-Amīn, the trustworthy, and worked in trade. At about twenty-five he married Khadīja bint Khuwaylid, a merchant of Quraysh in whose caravans he had travelled; she was the first to believe him when revelation came, and he took no other wife while she lived.',
    ],
  },
  {
    heading: 'Revelation and the Meccan years',
    events: [
      {
        when: 'aged 40',
        what: 'The first revelation, in the cave of Ḥirāʾ',
        note: 'the opening verses of Sūrat al-ʿAlaq, brought by Jibrīl',
      },
      { when: '13 years', what: 'Preaching in Mecca under mounting persecution' },
      {
        when: 'year 5 of the mission',
        what: 'The first emigration to Abyssinia',
        note: 'a group of the early Muslims given refuge by the Negus',
      },
      {
        when: 'years 7–10',
        what: 'The boycott of Banū Hāshim in the valley of Abū Ṭālib',
      },
      {
        when: 'year 10',
        what: 'The Year of Sorrow — the deaths of Khadīja and Abū Ṭālib',
        note: 'followed by the rejection at Ṭāʾif',
      },
      { when: 'year 11', what: 'The Night Journey and Ascension — al-Isrāʾ wa-l-Miʿrāj' },
    ],
  },
  {
    heading: 'The hijra',
    prose: [
      'He emigrated to Yathrib — thereafter Madīnat al-Nabī — in Rabīʿ al-Awwal of 622 CE, travelling with Abū Bakr and sheltering three days in the cave of Thawr. ʿUmar later set the start of that year as year 1 of the Islamic calendar, which is why every date in this corpus is counted from it.',
    ],
  },
  {
    heading: 'The Medinan years',
    events: [
      { when: '2 AH', what: 'Badr', note: 'about three hundred against a Meccan force three times their number' },
      { when: '3 AH', what: 'Uḥud', note: 'a reverse after the archers left their position; Ḥamza killed' },
      { when: '5 AH', what: 'The Trench — al-Khandaq', note: 'a siege of Medina broken without a general battle' },
      { when: '6 AH', what: 'The treaty of al-Ḥudaybiya', note: 'a truce the Qurʾān calls a clear victory' },
      { when: '7 AH', what: 'Khaybar' },
      { when: '8 AH', what: 'The conquest of Mecca', note: 'entered without battle; a general amnesty declared' },
      { when: '8 AH', what: 'Ḥunayn and the siege of Ṭāʾif' },
      { when: '9 AH', what: 'Tabūk', note: 'the last campaign he led' },
      { when: '10 AH', what: 'The Farewell Pilgrimage', note: 'and the sermon delivered at ʿArafa' },
    ],
  },
  {
    heading: 'Family',
    prose: [
      'His wives are called the Mothers of the Believers. Several are among the most prolific narrators in this corpus — ʿĀʾisha above all, whose chains run through more of it than any other Companion but Abū Hurayra.',
    ],
    rows: [
      {
        label: 'Wives',
        value:
          'Khadīja bint Khuwaylid · Sawda bint Zamʿa · ʿĀʾisha bint Abī Bakr · Ḥafṣa bint ʿUmar · Zaynab bint Khuzayma · Umm Salama · Zaynab bint Jaḥsh · Juwayriya bint al-Ḥārith · Umm Ḥabība · Ṣafiyya bint Ḥuyayy · Maymūna bint al-Ḥārith',
      },
      {
        label: 'Also',
        value: 'Māriya al-Qibṭiyya, mother of Ibrāhīm, whose status the sources report differently',
      },
      {
        label: 'Children',
        value:
          'al-Qāsim · ʿAbd Allāh · Zaynab · Ruqayya · Umm Kulthūm · Fāṭima — all by Khadīja — and Ibrāhīm by Māriya',
      },
      {
        label: 'Of those',
        value: 'all died in his lifetime but Fāṭima, who outlived him by some months',
      },
    ],
  },
  {
    heading: 'Signs of prophethood',
    prose: [
      'The tradition gathers these under dalāʾil al-nubuwwa, and treats the Qurʾān itself as the standing one: a challenge to produce its like that it records as unanswered. Of the rest, the splitting of the moon is named in the Qurʾān and reported in both Ṣaḥīḥs; so are the water flowing from between his fingers at al-Ḥudaybiya, the feeding of an army from a little food at the Trench, and the weeping of the palm trunk he had leant on when a pulpit replaced it.',
      'The sīra also records foretellings the community saw fulfilled — the Byzantine recovery announced at the opening of Sūrat al-Rūm among them.',
    ],
  },
  {
    heading: 'Death',
    prose: [
      'He died in Medina in Rabīʿ al-Awwal of 11 AH, aged about sixty-three, and is buried in the chamber of ʿĀʾisha where he died. Most of what is drawn below descends from him: a chain traced to the Prophet is a claim about how something he said or did reached the person who wrote it down, and the rest stop at a Companion or a Follower.',
    ],
  },
];

/** Where the outline above comes from. */
export const SIRA_SOURCES =
  'Drawn from the standard sīra — Ibn Isḥāq in the recension of Ibn Hishām, Ibn Saʿd’s Ṭabaqāt, and al-Ṭabarī — rather than from the corpus below it.';
