/**
 * The catalogue of books the ingester knows how to fetch.
 *
 * Adding a collection is a matter of adding an entry here and running
 * `npm run ingest -- <slug>` — nothing else in the pipeline or the app is
 * book-specific.
 */

export interface BookDefinition {
  slug: string;
  titleEn: string;
  titleAr: string;
  authorEn: string;
  authorAr: string;
  /** Compiler's death year, hijri. Sets the compiler's place in the layout. */
  authorDiedAH: number;
  /** Path within the hadith-json repository at the pinned tag. */
  path: string;
  /**
   * Matching book directory in the Itqan repository, which carries per-hadith
   * authenticity gradings. Omit where Itqan has no counterpart.
   */
  gradesFrom?: string;
  /**
   * Whose ruling a grade from this collection is.
   *
   * Required alongside `gradesFrom`, because an unattributed grade is worth
   * less than none: "ḍaʿīf" means one thing as a named critic's judgement and
   * another as an anonymous label. Set only where the attribution is known.
   *
   * Ṣaḥīḥ al-Bukhārī and Ṣaḥīḥ Muslim are deliberately absent. Every hadith in
   * them comes back "Sahih", which is the collection's own criterion restated
   * rather than a verdict anyone passed on the report, and presenting it beside
   * al-Albānī's rulings would suggest a judgement that was never made.
   */
  gradedBy?: { work: string; author: string };
}

/** Pinned so the upstream data format cannot shift under us. */
export const HADITH_JSON_TAG = 'v1.2.0';
export const HADITH_JSON_BASE = `https://raw.githubusercontent.com/AhmedBaset/hadith-json/${HADITH_JSON_TAG}`;
export const ITQAN_BASE = 'https://raw.githubusercontent.com/R3GENESI5/Itqan/master';

export const BOOKS: BookDefinition[] = [
  {
    slug: 'bukhari',
    titleEn: 'Sahih al-Bukhari',
    titleAr: 'صحيح البخاري',
    authorEn: 'Muḥammad ibn Ismāʿīl al-Bukhārī',
    authorAr: 'محمد بن إسماعيل البخاري',
    authorDiedAH: 256,
    path: 'db/by_book/the_9_books/bukhari.json',
  },
  {
    slug: 'muslim',
    titleEn: 'Sahih Muslim',
    titleAr: 'صحيح مسلم',
    authorEn: 'Muslim ibn al-Ḥajjāj al-Naysābūrī',
    authorAr: 'مسلم بن الحجاج النيسابوري',
    authorDiedAH: 261,
    path: 'db/by_book/the_9_books/muslim.json',
  },
  {
    slug: 'abudawud',
    titleEn: "Sunan Abi Dawud",
    titleAr: 'سنن أبي داود',
    authorEn: 'Abū Dāwūd al-Sijistānī',
    authorAr: 'أبو داود السجستاني',
    authorDiedAH: 275,
    path: 'db/by_book/the_9_books/abudawud.json',
    gradesFrom: 'abudawud',
    gradedBy: { work: 'Ṣaḥīḥ wa-Ḍaʿīf Sunan', author: 'Muḥammad Nāṣir al-Dīn al-Albānī (d. 1420 AH)' },
  },
  {
    slug: 'tirmidhi',
    titleEn: "Jami' at-Tirmidhi",
    titleAr: 'جامع الترمذي',
    authorEn: 'Abū ʿĪsā al-Tirmidhī',
    authorAr: 'أبو عيسى الترمذي',
    authorDiedAH: 279,
    path: 'db/by_book/the_9_books/tirmidhi.json',
    gradesFrom: 'tirmidhi',
    gradedBy: { work: 'Ṣaḥīḥ wa-Ḍaʿīf Sunan', author: 'Muḥammad Nāṣir al-Dīn al-Albānī (d. 1420 AH)' },
  },
  {
    slug: 'nasai',
    titleEn: "Sunan an-Nasa'i",
    titleAr: 'سنن النسائي',
    authorEn: 'Aḥmad ibn Shuʿayb al-Nasāʾī',
    authorAr: 'أحمد بن شعيب النسائي',
    authorDiedAH: 303,
    path: 'db/by_book/the_9_books/nasai.json',
    gradesFrom: 'nasai',
    gradedBy: { work: 'Ṣaḥīḥ wa-Ḍaʿīf Sunan', author: 'Muḥammad Nāṣir al-Dīn al-Albānī (d. 1420 AH)' },
  },
  {
    slug: 'ibnmajah',
    titleEn: 'Sunan Ibn Majah',
    titleAr: 'سنن ابن ماجه',
    authorEn: 'Ibn Mājah al-Qazwīnī',
    authorAr: 'ابن ماجه القزويني',
    authorDiedAH: 273,
    path: 'db/by_book/the_9_books/ibnmajah.json',
    gradesFrom: 'ibnmajah',
    gradedBy: { work: 'Ṣaḥīḥ wa-Ḍaʿīf Sunan', author: 'Muḥammad Nāṣir al-Dīn al-Albānī (d. 1420 AH)' },
  },
  {
    slug: 'malik',
    titleEn: 'Muwatta Malik',
    titleAr: 'موطأ مالك',
    authorEn: 'Mālik ibn Anas',
    authorAr: 'مالك بن أنس',
    authorDiedAH: 179,
    path: 'db/by_book/the_9_books/malik.json',
  },
  {
    slug: 'darimi',
    titleEn: 'Sunan ad-Darimi',
    titleAr: 'سنن الدارمي',
    authorEn: 'ʿAbd Allāh ibn ʿAbd al-Raḥmān al-Dārimī',
    authorAr: 'عبد الله بن عبد الرحمن الدارمي',
    authorDiedAH: 255,
    path: 'db/by_book/the_9_books/darimi.json',
  },
  {
    slug: 'ahmed',
    titleEn: 'Musnad Ahmad',
    titleAr: 'مسند أحمد',
    authorEn: 'Aḥmad ibn Ḥanbal',
    authorAr: 'أحمد بن حنبل',
    authorDiedAH: 241,
    path: 'db/by_book/the_9_books/ahmed.json',
  },
  {
    slug: 'nawawi40',
    titleEn: 'The Forty Hadith of al-Nawawi',
    titleAr: 'الأربعون النووية',
    authorEn: 'Yaḥyā ibn Sharaf al-Nawawī',
    authorAr: 'يحيى بن شرف النووي',
    authorDiedAH: 676,
    path: 'db/by_book/forties/nawawi40.json',
  },
  {
    slug: 'qudsi40',
    titleEn: 'The Forty Hadith Qudsi',
    titleAr: 'الأربعون القدسية',
    authorEn: 'Compiled tradition',
    authorAr: 'الأربعون القدسية',
    authorDiedAH: 0,
    path: 'db/by_book/forties/qudsi40.json',
  },
  {
    slug: 'riyad_assalihin',
    titleEn: 'Riyad as-Salihin',
    titleAr: 'رياض الصالحين',
    authorEn: 'Yaḥyā ibn Sharaf al-Nawawī',
    authorAr: 'يحيى بن شرف النووي',
    authorDiedAH: 676,
    path: 'db/by_book/other_books/riyad_assalihin.json',
  },
  {
    slug: 'bulugh_almaram',
    titleEn: 'Bulugh al-Maram',
    titleAr: 'بلوغ المرام',
    authorEn: 'Ibn Ḥajar al-ʿAsqalānī',
    authorAr: 'ابن حجر العسقلاني',
    authorDiedAH: 852,
    path: 'db/by_book/other_books/bulugh_almaram.json',
  },
  {
    slug: 'aladab_almufrad',
    titleEn: 'Al-Adab Al-Mufrad',
    titleAr: 'الأدب المفرد',
    authorEn: 'Muḥammad ibn Ismāʿīl al-Bukhārī',
    authorAr: 'محمد بن إسماعيل البخاري',
    authorDiedAH: 256,
    path: 'db/by_book/other_books/aladab_almufrad.json',
  },
  {
    slug: 'shamail_muhammadiyah',
    titleEn: 'Shamail al-Muhammadiyah',
    titleAr: 'الشمائل المحمدية',
    authorEn: 'Abū ʿĪsā al-Tirmidhī',
    authorAr: 'أبو عيسى الترمذي',
    authorDiedAH: 279,
    path: 'db/by_book/other_books/shamail_muhammadiyah.json',
  },
  {
    slug: 'mishkat_almasabih',
    titleEn: 'Mishkat al-Masabih',
    titleAr: 'مشكاة المصابيح',
    authorEn: 'al-Khaṭīb al-Tabrīzī',
    authorAr: 'الخطيب التبريزي',
    authorDiedAH: 741,
    path: 'db/by_book/other_books/mishkat_almasabih.json',
  },
];

export function findBook(slug: string): BookDefinition | undefined {
  return BOOKS.find((b) => b.slug === slug);
}
