import { landingFor } from "../variant-components";
import { useVariant } from "../variant-context";

export default function LandingRoute() {
  const { variant } = useVariant();
  const Component = landingFor[variant];
  return <Component />;
}
