import { useQuery } from '@tanstack/react-query';
import { getWorkerFilters, listWorkers } from '../../lib/api';
import { AudienceSplit } from './AudienceSplit';
import { FinalCta } from './FinalCta';
import { HeroSection } from './HeroSection';
import { HowItWorks } from './HowItWorks';
import { ProofLine } from './ProofLine';
import { VerificationStory } from './VerificationStory';
import { VerifiedPros } from './VerifiedPros';

const emptyFilters = { q: '', trade: '', location: '' };

export function Home() {
  const profiles = useQuery({
    queryKey: ['workers', emptyFilters, 0],
    queryFn: ({ signal }) => listWorkers(emptyFilters, 0, signal),
  });
  const filters = useQuery({
    queryKey: ['worker-filters'],
    queryFn: ({ signal }) => getWorkerFilters(signal),
  });

  const workers = profiles.data?.data ?? [];
  const total = profiles.data?.pagination.total ?? 0;
  const cities = filters.data?.locations.length ?? 0;
  const verifiedPros = workers.filter((w) => w.approved_verifications?.identity || w.approved_verifications?.skill).length;
  // Only show verified count when we have full first-page context and it's meaningful; total is real from API.
  const stats = [
    { value: total, label: total === 1 ? 'Professional' : 'Professionals' },
    ...(verifiedPros > 0 && workers.length >= total ? [{ value: verifiedPros, label: verifiedPros === 1 ? 'Verified pro' : 'Verified pros' }] : []),
    { value: cities, label: cities === 1 ? 'City' : 'Cities' },
  ];

  return (
    <div className="home-page">
      <HeroSection verifiedPros={workers.length > 0 && workers.length >= total ? verifiedPros : 0} proofLoading={profiles.isPending} />
      <ProofLine stats={stats} />
      <VerificationStory />
      <HowItWorks />
      <VerifiedPros workers={workers.slice(0, 6)} />
      <AudienceSplit />
      <FinalCta />
    </div>
  );
}
