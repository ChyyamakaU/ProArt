export type HomeImageSlot = {
  src: string;
  fallback: string;
  position?: string;
};

const local = {
  technician: '/images/technician.jpg',
  tailoring: '/images/tailoring-studio.jpg',
} as const;

export const homeImages = {
  hero: { src: '/images/home/hero-artisan.webp', fallback: local.technician, position: '70% 20%' },
  verifyIdentity: { src: '/images/home/verify-identity.webp', fallback: local.tailoring, position: 'center' },
  verifySkill: { src: '/images/home/verify-skill.webp', fallback: local.technician, position: 'center' },
  verifyContact: { src: '/images/home/verify-contact.webp', fallback: local.tailoring, position: 'center' },
  howItWorks: { src: '/images/home/how-it-works-panorama.webp', fallback: local.tailoring, position: 'center' },
  workerPortrait1: { src: '/images/home/worker-portrait-1.webp', fallback: local.tailoring, position: 'center top' },
  workerPortrait2: { src: '/images/home/worker-portrait-2.webp', fallback: local.tailoring, position: 'center top' },
  workerPortrait3: { src: '/images/home/worker-portrait-3.webp', fallback: local.tailoring, position: 'center top' },
  forWorkers: { src: '/images/home/for-workers.webp', fallback: local.technician, position: 'center' },
  forHirers: { src: '/images/home/for-hirers.webp', fallback: local.tailoring, position: 'center' },
  finalCta: { src: '/images/home/final-cta.webp', fallback: local.technician, position: 'center' },
} satisfies Record<string, HomeImageSlot>;
