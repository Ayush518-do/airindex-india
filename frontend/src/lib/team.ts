/**
 * Team details shown on the landing page (hero line + "Meet the team").
 *
 * ✏️  EDIT THIS FILE with your real names, roles and college. The bracketed
 * values are placeholders. Set `mentor` to null to hide the mentor card.
 */
export const TEAM = {
  name: '[TEAM NAME]',
  college: '[COLLEGE NAME, CITY]',
  members: [
    { name: '[Member 1]', role: '[Role]' },
    { name: '[Member 2]', role: '[Role]' },
    { name: '[Member 3]', role: '[Role]' },
    { name: '[Member 4]', role: '[Role]' },
    { name: '[Member 5]', role: '[Role]' },
    { name: '[Member 6]', role: '[Role]' },
  ],
  mentor: { name: '[Mentor name]', role: 'Mentor' } as { name: string; role: string } | null,
};

export const PROBLEM = {
  hackathon: 'Smart India Hackathon 2026',
  statement: 'Problem Statement 26056',
  organisation: 'MoSPI',
  division: 'Data Informatics & Innovation Division',
  theme: 'Smart Automation',
};

/** "[Member 1]" -> "M1", "Priya Sharma" -> "PS". */
export function initials(name: string): string {
  const words = name.replace(/[[\]]/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
