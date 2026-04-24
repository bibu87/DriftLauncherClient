interface ImportMeta {
  readonly env: {
    readonly DEV: boolean
    readonly PROD: boolean
    readonly MODE: string
    readonly [key: string]: string | boolean | undefined
  }
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}
