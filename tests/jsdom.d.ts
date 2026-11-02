// jsdom ships no types and @types/jsdom is not one of the pinned test libraries, so the tests declare the little they use.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { contentType?: string });
    window: { DOMParser: new () => { parseFromString(text: string, type: string): unknown } };
  }
}
