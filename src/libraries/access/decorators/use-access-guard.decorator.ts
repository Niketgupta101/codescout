import { UseGuards } from "@nestjs/common";
import { AccessGuard } from "../guards/access.guard";

/**
 * Convenience decorator to register the access guard.
 */
export const UseAccessGuard = () => UseGuards(AccessGuard);
