import { ButtonLink } from "@/components/ui/button";
import { LogoMark } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="mesh-bg grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <LogoMark className="mx-auto h-14 w-14" />
        <h1 className="mt-6 font-display text-3xl font-bold text-fg">Page not found</h1>
        <p className="mt-2 text-fg-muted">This page drifted out of the SkillVerse.</p>
        <ButtonLink href="/" className="mt-6">
          Go home
        </ButtonLink>
      </div>
    </div>
  );
}
