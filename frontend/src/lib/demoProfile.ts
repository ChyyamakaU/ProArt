const disclosure = 'This profile represents a fictional professional for the SkillVerify investor demo.';

export function demoProfilePresentation(profile: { slug: string; bio: string }) {
  const synthetic = profile.slug.startsWith('synthetic-demo-') && profile.bio.endsWith(disclosure);
  return {
    synthetic,
    bio: synthetic ? profile.bio.slice(0, -disclosure.length).trimEnd() : profile.bio,
  };
}
