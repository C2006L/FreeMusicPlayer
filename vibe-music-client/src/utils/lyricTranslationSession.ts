// Serialize cancellation with creation. A late creation response belongs to
// the stopped request, never to a subsequent translation of the same text.
export class LyricTranslationSession<Input, Job extends { id: string }> {
  private epoch = 0
  private creation?: Promise<Job>
  private activeId?: string
  private cleanup: Promise<void> = Promise.resolve()
  constructor(private create: (input: Input) => Promise<Job>, private cancel: (id: string) => Promise<unknown>) {}
  async start(input: Input) {
    const lease = ++this.epoch
    await this.cleanup.catch(() => {})
    if (lease !== this.epoch) throw new Error('cancelled')
    const pending = this.create(input)
    this.creation = pending
    try {
      const job = await pending
      if (lease !== this.epoch) throw new Error('cancelled')
      this.activeId = job.id
      return { job, lease }
    } finally { if (this.creation === pending) this.creation = undefined }
  }
  finish(lease: number) { if (lease === this.epoch) this.activeId = undefined }
  stop() {
    this.epoch++
    const creation = this.creation, id = this.activeId
    this.activeId = undefined
    const cleanup = this.cleanup.catch(() => {}).then(async () => {
      const target = id || (await creation?.catch(() => undefined))?.id
      if (target) await this.cancel(target)
    })
    this.cleanup = cleanup
    return cleanup
  }
}
