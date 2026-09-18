import type { ComponentType } from "react";
import type { VariantId } from "./variants";
import CreativeDemo from "./variants/creative/Demo";
import CreativeLanding from "./variants/creative/Landing";
import LuxuryDemo from "./variants/luxury/Demo";
import LuxuryLanding from "./variants/luxury/Landing";
import MinimalDemo from "./variants/minimal/Demo";
import MinimalLanding from "./variants/minimal/Landing";

export const landingFor: Record<VariantId, ComponentType> = {
  minimal: MinimalLanding,
  luxury: LuxuryLanding,
  creative: CreativeLanding,
};

export const demoFor: Record<VariantId, ComponentType> = {
  minimal: MinimalDemo,
  luxury: LuxuryDemo,
  creative: CreativeDemo,
};
