import { demoFor } from "../variant-components";
import { useVariant } from "../variant-context";

export default function DemoRoute() {
  const { variant } = useVariant();
  const Component = demoFor[variant];
  return <Component />;
}
