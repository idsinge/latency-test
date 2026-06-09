<div style="display:flex;align-items:center;gap:14px;margin-bottom:1.5rem">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/angular/angular-original.svg" width="52" height="52" alt="Angular">
<span style="font-size:2rem;font-weight:700;line-height:1">Angular Integration</span>
</div>


---

## Setup

```bash
npm install @adasp/latency-test
```

Import the package once in `main.ts`:

```ts
import '@adasp/latency-test'
```

Add `CUSTOM_ELEMENTS_SCHEMA` to every Angular module or standalone component that uses `<latency-test>`, otherwise Angular will throw a template error on the unknown element.

---

## Standalone component (Angular 15+)

The recommended pattern is a two-step flow: connect audio first, then run tests. This keeps the mic stream warm between repeated clicks and avoids cold-start instability.

```ts
import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  Input
} from '@angular/core'
import { NgIf, DecimalPipe } from '@angular/common'

const MIC_CONSTRAINTS = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
}

@Component({
  selector: 'app-latency-tester',
  standalone: true,
  imports: [NgIf, DecimalPipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <latency-test #lt [attr.number-of-tests]="numberOfTests"></latency-test>
    <button *ngIf="!isConnected" (click)="connect()">Connect Audio</button>
    <button *ngIf="isConnected" (click)="start()">Test Latency</button>
    <p *ngIf="result">{{ result.latency.toFixed(2) }} ms — ratio: {{ result.ratio | number:'1.2-2' }} dB</p>
    <p *ngIf="stats && stats.results?.length > 1">
      Mean: {{ stats.mean | number:'1.2-2' }} ms | SD: {{ stats.std | number:'1.2-2' }} |
      Min: {{ stats.min | number:'1.2-2' }} | Max: {{ stats.max | number:'1.2-2' }}
    </p>
    <p *ngIf="error" style="color:red">{{ error }}</p>
  `
})
export class LatencyTesterComponent implements AfterViewInit, OnDestroy {
  @Input() numberOfTests = 5
  @ViewChild('lt') ltRef!: ElementRef<HTMLElement>

  isConnected = false
  result: any = null
  stats: any = null
  error: string | null = null

  private micStream: MediaStream | null = null
  private audioCtx: AudioContext | null = null

  private onResult = (e: Event) => { this.result = (e as CustomEvent).detail }
  private onComplete = (e: Event) => { this.stats = (e as CustomEvent).detail }
  private onError = (e: Event) => { this.error = (e as CustomEvent).detail.message }

  ngAfterViewInit() {
    const el = this.ltRef.nativeElement
    el.addEventListener('latency-result', this.onResult)
    el.addEventListener('latency-complete', this.onComplete)
    el.addEventListener('latency-error', this.onError)
  }

  ngOnDestroy() {
    const el = this.ltRef.nativeElement
    el.removeEventListener('latency-result', this.onResult)
    el.removeEventListener('latency-complete', this.onComplete)
    el.removeEventListener('latency-error', this.onError)
    this.micStream?.getTracks().forEach(t => t.stop())
    this.audioCtx?.close()
  }

  async connect() {
    try {
      this.audioCtx = new AudioContext({ latencyHint: 0 })
      this.micStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
      ;(this.ltRef.nativeElement as any).inputStream = this.micStream
      ;(this.ltRef.nativeElement as any).audioContext = this.audioCtx
      this.isConnected = true
    } catch (e: any) {
      this.micStream?.getTracks().forEach(t => t.stop())
      this.micStream = null
      this.error = `Could not access mic: ${e.message}`
    }
  }

  start() { (this.ltRef.nativeElement as any).start() }
  stop() { (this.ltRef.nativeElement as any).stop() }
}
```

> **Real-world use:** In an application that already manages a mic stream and `AudioContext` (e.g. a Web Audio DAW), pass both directly — no Connect Audio step needed. See [Sharing audio resources from a host app](#sharing-audio-resources-from-a-host-app).

---

## Sharing audio resources from a host app

When your application already owns a mic stream and `AudioContext`, pass both to the element. The component will not stop the stream or close the context — the host owns both lifetimes.

```ts
ngAfterViewInit() {
  const el = this.ltRef.nativeElement as any
  if (this.audioContext) el.audioContext = this.audioContext
  if (this.inputStream) el.inputStream = this.inputStream
}
```

---

## NgModule-based projects (Angular < 15)

Add `CUSTOM_ELEMENTS_SCHEMA` to the `schemas` array of your `NgModule`:

```ts
import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'

@NgModule({
  declarations: [LatencyTesterComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppModule {}
```

---

## TypeScript

Types ship with the package. Import `LatencyTestElement` directly:

```ts
import type { LatencyTestElement } from '@adasp/latency-test'
import { ViewChild, ElementRef, AfterViewInit } from '@angular/core'

@ViewChild('lt') ltRef!: ElementRef<LatencyTestElement>

ngAfterViewInit() {
  this.ltRef.nativeElement.start()
  this.ltRef.nativeElement.audioContext  // ✅ typed
}
```

> `CUSTOM_ELEMENTS_SCHEMA` disables Angular's template type checker for custom elements. TypeScript types apply to programmatic `@ViewChild` access only.
