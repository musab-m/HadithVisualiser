/**
 * The works of `ilm ar-rijal` a verdict can come from. Keys match the
 * `classical_sources` map in the Itqan rijal database.
 */

export interface RijalWork {
  work: string;
  author: string;
}

export const RIJAL_WORKS: Record<string, RijalWork> = {
  taqrib: { work: "Taqrīb al-Tahdhīb", author: "Ibn Ḥajar al-ʿAsqalānī (d. 852 AH)" },
  tahdhib_tahdhib: { work: "Tahdhīb al-Tahdhīb", author: "Ibn Ḥajar al-ʿAsqalānī (d. 852 AH)" },
  tahdhib_kamal: { work: "Tahdhīb al-Kamāl", author: "al-Mizzī (d. 742 AH)" },
  isaba: { work: "al-Iṣāba fī Tamyīz al-Ṣaḥāba", author: "Ibn Ḥajar al-ʿAsqalānī (d. 852 AH)" },
  lisan_mizan: { work: "Lisān al-Mīzān", author: "Ibn Ḥajar al-ʿAsqalānī (d. 852 AH)" },
  durar_kamina: { work: "al-Durar al-Kāmina", author: "Ibn Ḥajar al-ʿAsqalānī (d. 852 AH)" },
  jarh: { work: "al-Jarḥ wa-l-Taʿdīl", author: "Ibn Abī Ḥātim al-Rāzī (d. 327 AH)" },
  thiqat: { work: "al-Thiqāt", author: "Ibn Ḥibbān al-Bustī (d. 354 AH)" },
  kamil: { work: "al-Kāmil fī Ḍuʿafāʾ al-Rijāl", author: "Ibn ʿAdī al-Jurjānī (d. 365 AH)" },
  tabaqat: { work: "al-Ṭabaqāt al-Kubrā", author: "Ibn Saʿd (d. 230 AH)" },
  tarikh: { work: "al-Tārīkh al-Kabīr", author: "al-Bukhārī (d. 256 AH)" },
  mizan: { work: "Mīzān al-Iʿtidāl", author: "al-Dhahabī (d. 748 AH)" },
  kashif: { work: "al-Kāshif", author: "al-Dhahabī (d. 748 AH)" },
  siyar: { work: "Siyar Aʿlām al-Nubalāʾ", author: "al-Dhahabī (d. 748 AH)" },
  tarikh_islam: { work: "Tārīkh al-Islām", author: "al-Dhahabī (d. 748 AH)" },
  tadhkirat_huffaz: { work: "Tadhkirat al-Ḥuffāẓ", author: "al-Dhahabī (d. 748 AH)" },
  mughni_ducafa: { work: "al-Mughnī fī al-Ḍuʿafāʾ", author: "al-Dhahabī (d. 748 AH)" },
  diwan_ducafa: { work: "Dīwān al-Ḍuʿafāʾ", author: "al-Dhahabī (d. 748 AH)" },
  dhayl_diwan: { work: "Dhayl Dīwān al-Ḍuʿafāʾ", author: "al-Dhahabī (d. 748 AH)" },
  mucin_tabaqat: { work: "al-Muʿīn fī Ṭabaqāt al-Muḥaddithīn", author: "al-Dhahabī (d. 748 AH)" },
  mucjam_shuyukh: { work: "Muʿjam al-Shuyūkh", author: "al-Dhahabī (d. 748 AH)" },
  macrifa_qurra: { work: "Maʿrifat al-Qurrāʾ al-Kibār", author: "al-Dhahabī (d. 748 AH)" },
};

/** Ibn Ḥajar's twelve ṭabaqāt, as written in Taqrīb al-Tahdhīb. */
const TABAQAT_ORDINALS: Record<string, number> = {
  الاولى: 1,
  الثانيه: 2,
  الثالثه: 3,
  الرابعه: 4,
  الخامسه: 5,
  السادسه: 6,
  السابعه: 7,
  الثامنه: 8,
  التاسعه: 9,
  العاشره: 10,
  'الحاديه عشره': 11,
  'الثانيه عشره': 12,
};

/** Parse `الثالثة` / `الحادية عشرة` into its ṭabaqa number. */
export function parseTabaqa(raw: unknown, normalise: (s: string) => string): number | undefined {
  if (!raw) return undefined;
  const key = normalise(String(raw));
  if (!key || key === '-') return undefined;
  // Longest match first so `الثانية عشرة` beats `الثانية`.
  const entries = Object.entries(TABAQAT_ORDINALS).sort((a, b) => b[0].length - a[0].length);
  for (const [word, n] of entries) if (key.includes(word)) return n;
  return undefined;
}
