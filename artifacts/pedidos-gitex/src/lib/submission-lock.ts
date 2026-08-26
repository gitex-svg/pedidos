/**
 * Blocks duplicate mutations synchronously, before React Query can publish its
 * asynchronous pending state to the next render.
 */
export class SubmissionLock {
  private locked = false;

  acquire(): boolean {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  release(): void {
    this.locked = false;
  }
}