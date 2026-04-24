export interface SteamSession {
  steamId: string
  name: string
  ticket: string
}

export interface LOSession {
  token: string
  playerName: string
  motd: string
  encryptionToken: string
  platform: 'PC' | 'XBOX' | 'CROSS' | 'NONE'
}

export interface LoginWithSteamPayload {
  uniqueNetId: string
  steamName: string
  steamSessionTicket: string
  createNewSession: boolean
}
