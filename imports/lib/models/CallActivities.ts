import { z } from "zod";
import { foreignKey } from "./customTypes";

const CallActivity = z.object({
  ts: z.date(),
  hunt: foreignKey,
  call: foreignKey,
  user: foreignKey,
});

export type CallActivityType = z.output<typeof CallActivity>;

export default CallActivity;
