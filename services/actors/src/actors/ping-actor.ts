import type {
  ActorCategory,
  Ctx,
  PingActorInterface,
  PingResult,
} from "@cellar-assistant/contracts";
import { PingActorDescriptor } from "@cellar-assistant/contracts";
import { AbstractActor } from "@dapr/dapr";
import { correlationId } from "../lib/telemetry.ts";

/**
 * A2 smoke actor. Proves the sidecar round-trip (placement registration, actor
 * activation, method dispatch) without touching Postgres.
 *
 * Deliberately holds no Dapr actor state. A2 originally noted that no
 * `actorStateStore` component was declared; that turned out not to be a
 * reachable configuration — Dapr refuses to host actors without one — so the
 * compose stack declares `state.in-memory`. §1.3 is now enforced by
 * `src/lib/no-actor-state.test.ts` instead, which is why this actor still
 * touches nothing.
 *
 * It predates `ActorBase` and does not extend it, because it holds no database
 * and exists only to prove the sidecar round-trip. Real actors extend
 * `src/lib/actor-base.ts`. TODO: delete this once a real entity actor is
 * registered (B1).
 */
export class PingActor extends AbstractActor implements PingActorInterface {
  /** §8.3: category as a static field. */
  static readonly category: ActorCategory = PingActorDescriptor.category;

  /** In-memory, per-activation. Non-zero on the second call proves the
   *  activation was reused rather than reconstructed. */
  private turns = 0;
  private activatedAt: string | null = null;

  override async onActivate(): Promise<void> {
    this.activatedAt = new Date().toISOString();
    this.turns = 0;
  }

  async ping(ctx: Ctx, message: string): Promise<PingResult> {
    this.turns += 1;
    return {
      pong: true,
      message: `${message} (request ${correlationId(ctx)}, activated ${this.activatedAt ?? "never"})`,
      actorId: this.getActorId().getId(),
      at: new Date().toISOString(),
      turns: this.turns,
    };
  }
}
