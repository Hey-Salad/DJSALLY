"use client"

import { useEffect, useRef, useState, useCallback } from "react"

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error"

export interface DeviceState {
  raspberryPi: { connected: boolean; cpuTemp: number; cpuUsage: number; memoryUsage: number }
  cameras: {
    ptz: { connected: boolean; streamUrl: string; pan: number; tilt: number; zoom: number }
    webcam: { connected: boolean; streamUrl: string }
  }
  macroPads: {
    id: string
    connected: boolean
    buttons: { id: number; pressed: boolean; label: string }[]
    encoder: { value: number; min: number; max: number }
  }[]
  speaker: { connected: boolean; volume: number; muted: boolean }
  spotify: SpotifyState
  hidSetup?: {
    enabled: boolean
    decks: {
      pad: number
      label: string
      rawPath: string
      rawPaths?: string[]
      eventPath: string
      eventPaths?: string[]
      learnedCodes: number[]
      lastEvent: string | null
      lastHex: string | null
      lastSource?: string | null
      lastKnob?: string | null
      knobPressed?: boolean
    }[]
  }
}

export interface SpotifyTrackState {
  id?: string
  name: string
  uri: string
  artists: string[]
  album: string | null
  image?: string | null
}

export interface SpotifyState {
  isPlaying: boolean
  deviceName: string | null
  contextUri: string | null
  contextType: string | null
  nowPlaying: SpotifyTrackState | null
  incoming: SpotifyTrackState | null
  queue: SpotifyTrackState[]
  updatedAt: string | null
}

const initialState: DeviceState = {
  raspberryPi: { connected: false, cpuTemp: 0, cpuUsage: 0, memoryUsage: 0 },
  cameras: {
    ptz: { connected: false, streamUrl: "", pan: 0, tilt: 0, zoom: 1 },
    webcam: { connected: false, streamUrl: "" },
  },
  macroPads: [
    {
      id: "pad-1",
      connected: false,
      buttons: [
        { id: 0, pressed: false, label: "CUE" },
        { id: 1, pressed: false, label: "PLAY" },
        { id: 2, pressed: false, label: "SYNC" },
      ],
      encoder: { value: 50, min: 0, max: 100 },
    },
    {
      id: "pad-2",
      connected: false,
      buttons: [
        { id: 0, pressed: false, label: "CUE" },
        { id: 1, pressed: false, label: "PLAY" },
        { id: 2, pressed: false, label: "SYNC" },
      ],
      encoder: { value: 50, min: 0, max: 100 },
    },
  ],
  speaker: { connected: false, volume: 65, muted: false },
  spotify: {
    isPlaying: false,
    deviceName: null,
    contextUri: null,
    contextType: null,
    nowPlaying: null,
    incoming: null,
    queue: [],
    updatedAt: null,
  },
  hidSetup: {
    enabled: false,
    decks: [
      { pad: 1, label: "Deck A", rawPath: "", eventPath: "", learnedCodes: [], lastEvent: null, lastHex: null },
      { pad: 2, label: "Deck B", rawPath: "", eventPath: "", learnedCodes: [], lastEvent: null, lastHex: null },
    ],
  },
}

// Public deployments should not probe localhost automatically; browsers may
// treat that as a local-network access request and block the page.
const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_DJ_SALLY_WS_URL || ""
const LOCAL_FALLBACK_WS_URL = "ws://localhost:8080"

function isLocalDashboardHost() {
  if (typeof window === "undefined") return false

  const hostname = window.location.hostname
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")
}

interface UseWebSocketReturn {
  status: ConnectionStatus
  deviceState: DeviceState
  connect: (url?: string) => void
  disconnect: () => void
  // Command methods
  sendPTZ: (action: "up" | "down" | "left" | "right" | "zoomIn" | "zoomOut") => void
  sendMacroButton: (pad: number, button: number, pressed: boolean) => void
  sendEncoder: (pad: number, value: number) => void
  sendVolume: (value: number) => void
  sendMute: (muted: boolean) => void
  sendTransport: (action: "play" | "pause" | "skipForward" | "skipBack") => void
  sendEffect: (name: string) => void
}

export function useWebSocket(): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")
  const [deviceState, setDeviceState] = useState<DeviceState>(initialState)
  const wsRef = useRef<WebSocket | null>(null)

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const connect = useCallback((url?: string) => {
    const wsUrl = url || DEFAULT_WS_URL || (isLocalDashboardHost() ? LOCAL_FALLBACK_WS_URL : "")

    if (!wsUrl) {
      setStatus("disconnected")
      return
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }

    setStatus("connecting")

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log("[WebSocket] Connected to", wsUrl)
        setStatus("connected")
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "state_update" && data.payload) {
            setDeviceState(data.payload)
          }
        } catch (error) {
          console.error("[WebSocket] Failed to parse message:", error)
        }
      }

      ws.onclose = () => {
        console.log("[WebSocket] Disconnected")
        setStatus("disconnected")
        setDeviceState(initialState)
      }

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error)
        setStatus("error")
      }
    } catch (error) {
      console.error("[WebSocket] Connection failed:", error)
      setStatus("error")
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    setStatus("disconnected")
  }, [])

  // Command methods matching the protocol
  const sendPTZ = useCallback(
    (action: "up" | "down" | "left" | "right" | "zoomIn" | "zoomOut") => {
      sendMessage({ type: "ptz", action })
    },
    [sendMessage]
  )

  const sendMacroButton = useCallback(
    (pad: number, button: number, pressed: boolean) => {
      sendMessage({ type: "macroButton", pad, button, pressed })
    },
    [sendMessage]
  )

  const sendEncoder = useCallback(
    (pad: number, value: number) => {
      sendMessage({ type: "encoder", pad, value })
    },
    [sendMessage]
  )

  const sendVolume = useCallback(
    (value: number) => {
      sendMessage({ type: "volume", value })
    },
    [sendMessage]
  )

  const sendMute = useCallback(
    (muted: boolean) => {
      sendMessage({ type: "mute", muted })
    },
    [sendMessage]
  )

  const sendTransport = useCallback(
    (action: "play" | "pause" | "skipForward" | "skipBack") => {
      sendMessage({ type: "transport", action })
    },
    [sendMessage]
  )

  const sendEffect = useCallback(
    (name: string) => {
      sendMessage({ type: "effect", name })
    },
    [sendMessage]
  )

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  return {
    status,
    deviceState,
    connect,
    disconnect,
    sendPTZ,
    sendMacroButton,
    sendEncoder,
    sendVolume,
    sendMute,
    sendTransport,
    sendEffect,
  }
}
