export interface ModStatus {
  workshopId: string
  name?: string
  installed: boolean
  subscribed: boolean
  active: boolean
  upToDate: boolean
  sizeBytes?: number
}

export interface ModMetadata {
  workshopId: string
  name?: string
  sizeBytes?: number
  updatedAt: string
}

export interface DownloadProgress {
  workshopId: string
  pct: number
  speed: number
}
