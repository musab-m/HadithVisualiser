/**
 * The classical works whose entries are read in full, and where to get them.
 *
 * OpenITI publishes the texts under a URI that names the author, the work and
 * the version: century repository → author → book → version. Its centuries are
 * quarter-centuries, so Ibn Ḥajar (d. 852) is filed under `0875AH`.
 *
 * Only versions OpenITI marks `.completed` carry the biography markup the
 * parser needs; the plain ones are undifferentiated paragraphs. The edition is
 * named here because it is shown to the reader with every entry: a line of
 * Taqrīb quoted without saying which printing it came from invites being taken
 * for the work itself rather than for one reading of it.
 */

export interface WorkSource {
  /** Key into `RIJAL_WORKS`, and into a profile's `classical_sources`. */
  key: string;
  /** OpenITI century repository. */
  repo: string;
  /** Path within it. */
  path: string;
  /** The printed edition this version was made from. */
  edition: string;
}

const OPENITI = 'https://raw.githubusercontent.com/OpenITI';

export const WORK_SOURCES: WorkSource[] = [
  {
    key: 'taqrib',
    repo: '0875AH',
    path: 'data/0852IbnHajarCasqalani/0852IbnHajarCasqalani.TaqribTahdhib/0852IbnHajarCasqalani.TaqribTahdhib.JK000121-ara1.completed',
    edition: 'تحقيق محمد عوامة، دار الرشيد، سوريا، الأولى ١٤٠٦هـ',
  },
];

export function urlOf(source: WorkSource): string {
  return `${OPENITI}/${source.repo}/master/${source.path}`;
}

/** Where the downloaded text is kept, under `.cache/`. */
export function fileOf(source: WorkSource): string {
  return `${source.key}.txt`;
}
