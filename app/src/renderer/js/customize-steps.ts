export type CustomizeStep = 1 | 2 | 3;

export function clampCustomizeStep(n: number): CustomizeStep {
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return n as CustomizeStep;
}

export function nextCustomizeStep(step: CustomizeStep): CustomizeStep {
  return clampCustomizeStep(step + 1);
}

export function prevCustomizeStep(step: CustomizeStep): CustomizeStep {
  return clampCustomizeStep(step - 1);
}

export function customizePrimaryLabel(step: CustomizeStep): "Next" | "Done" {
  return step === 3 ? "Done" : "Next";
}
