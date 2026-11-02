import { createElement } from "react";
import {
  Bike,
  Bus,
  Car,
  Caravan,
  Construction,
  Container,
  Forklift,
  PlugZap,
  Smartphone,
  Tractor,
  Truck,
  Van,
  type LucideIcon,
} from "lucide-react";

/**
 * Vehicle type name (company-defined `vehicleTypes`, seeded with Truck, Car, SchoolBus, PickUp,
 * Crane, JCB, Van, Tanker, …) → icon. Matched by keyword so new custom types still get a sensible
 * icon; unknown types fall back to a car.
 */
const RULES: [RegExp, LucideIcon][] = [
  [/motor|bike|scooter/i, Bike],
  [/bus|coaster|urvan|hiace/i, Bus],
  [/van|reefer/i, Van],
  [/fork ?lift|bobcat/i, Forklift],
  [/crane|jcb|bulldozer|excavator|shovel|roller|loader|machine/i, Construction],
  [/tractor/i, Tractor],
  [/trailer/i, Caravan],
  [/tank|dumper|container/i, Container],
  [/truck|canter|dyna|lorry/i, Truck],
  [/generator/i, PlugZap],
  [/phone/i, Smartphone],
];

export function vehicleIcon(typeName: string | null | undefined): LucideIcon {
  if (!typeName) return Car;
  for (const [re, Icon] of RULES) if (re.test(typeName)) return Icon;
  return Car;
}

/** The type's icon as an element (a static component, so the React Compiler can keep it stable). */
export function VehicleTypeIcon({ typeName, className }: { typeName: string | null | undefined; className?: string }) {
  return createElement(vehicleIcon(typeName), { className, "aria-hidden": true });
}
