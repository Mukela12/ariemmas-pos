// Global VAT on/off switch, driven by the `vat_enabled` setting. New businesses
// often aren't VAT-registered yet, so this defaults OFF; an admin turns it on in
// Settings once the shop is registered. The sale store's VAT getters read this
// live, so toggling it updates the breakdown without recomputing the cart.
let vatEnabled = false

export function setVatEnabled(on: boolean): void {
  vatEnabled = on
}

export function isVatEnabled(): boolean {
  return vatEnabled
}
