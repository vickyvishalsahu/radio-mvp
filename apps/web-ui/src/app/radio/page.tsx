import { quotes } from "@/lib/quotes";
import RadioPlayer from "@/components/RadioPlayer";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function RadioPage() {
  return (
    <ErrorBoundary>
      <RadioPlayer quotes={quotes} />
    </ErrorBoundary>
  );
}
