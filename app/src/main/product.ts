// app/src/main/product.ts
export const PRODUCT_NAME = "AnyLM";

export function productDisplayName(isPackaged: boolean): string {
  return isPackaged ? PRODUCT_NAME : `${PRODUCT_NAME} (Dev)`;
}
