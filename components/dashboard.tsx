"use client"

import { useState, useEffect, useCallback } from "react"
import { useWebSocket } from "@/hooks/use-websocket"
import { WorkflowReadinessPanel } from "@/components/workflow-readiness-panel"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import {
  Disc3,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Camera,
  Mic,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Zap,
  Radio,
  Music,
  Settings,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react"

const CURRENT_PLAYLIST_URI = "spotify:playlist:1oT190vGpWmZY7NPhndFUM"
const BAMBOO_VOLUME_PRESET = 24

type SallyCommand = {
  type: string
  [key: string]: unknown
}

type DeckTrack = {
  id?: string
  name: string
  uri: string
  artists: string[]
  album: string | null
  image?: string | null
}

type SpotifyDeckState = {
  isPlaying: boolean
  deviceName: string | null
  contextUri: string | null
  contextType: string | null
  nowPlaying: DeckTrack | null
  incoming: DeckTrack | null
  queue: DeckTrack[]
  updatedAt: string | null
}

export function Dashboard() {
  const { 
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
  } = useWebSocket()
  const [isPlaying, setIsPlaying] = useState(false)
  const [bpm, setBpm] = useState(128)
  const [waveformBars, setWaveformBars] = useState<number[]>(Array(32).fill(0))
  const [commandPending, setCommandPending] = useState<string | null>(null)
  const [commandStatus, setCommandStatus] = useState("Ready")
  const [crossfader, setCrossfader] = useState(0)
  const [deckAGain, setDeckAGain] = useState(100)
  const [deckBGain, setDeckBGain] = useState(0)
  const [transitionCurve, setTransitionCurve] = useState(50)
  const [spotifySnapshot, setSpotifySnapshot] = useState<SpotifyDeckState | null>(null)
  const [outputVolumeSnapshot, setOutputVolumeSnapshot] = useState<number | null>(null)
  const spotifyState = spotifySnapshot ?? deviceState.spotify
  const nowPlaying = spotifyState.nowPlaying
  const incomingTrack = spotifyState.incoming ?? getIncomingFallback(nowPlaying)
  const deckABalance = 100 - crossfader
  const deckBBalance = crossfader
  const outputVolume = outputVolumeSnapshot ?? deviceState.speaker.volume

  const applySallyPayloadSnapshots = useCallback((payload: unknown) => {
    const spotify = normalizeSpotifyDeckState(payload)
    if (spotify) {
      setSpotifySnapshot(spotify)
      setIsPlaying(spotify.isPlaying)
    }

    const outputVolume = normalizeOutputVolume(payload)
    if (typeof outputVolume === "number") {
      setOutputVolumeSnapshot(outputVolume)
    }
  }, [])

  // Animate waveform
  useEffect(() => {
    const interval = setInterval(() => {
      if (status === "connected" && isPlaying) {
        setWaveformBars(Array(32).fill(0).map(() => Math.random() * 100))
      }
    }, 50)
    return () => clearInterval(interval)
  }, [status, isPlaying])

  useEffect(() => {
    let cancelled = false

    const refreshSpotifyDecks = async () => {
      try {
        const response = await fetch("/api/local/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "status" }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload || cancelled) return
        applySallyPayloadSnapshots(payload)
      } catch {
        // Keep the last deck snapshot; local Sally may be offline on deployed previews.
      }
    }

    void refreshSpotifyDecks()
    const interval = setInterval(() => {
      void refreshSpotifyDecks()
    }, 10000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [applySallyPayloadSnapshots])

  const handlePTZControl = (action: "up" | "down" | "left" | "right" | "zoomIn" | "zoomOut") => {
    sendPTZ(action)
  }

  const handleButtonPress = (pad: number, buttonId: number) => {
    sendMacroButton(pad, buttonId, true)
  }

  const handleEncoderChange = (pad: number, value: number) => {
    sendEncoder(pad, value)
  }

  const handleVolumeChange = (value: number) => {
    setOutputVolumeSnapshot(value)
    sendVolume(value)
  }

  const handleMuteToggle = () => {
    sendMute(!deviceState.speaker.muted)
  }

  const handleTransport = (action: "play" | "pause" | "skipForward" | "skipBack") => {
    sendTransport(action)
    if (action === "play") setIsPlaying(true)
    if (action === "pause") setIsPlaying(false)
  }

  const handleEffectClick = (effectName: string) => {
    sendEffect(effectName.toLowerCase())
  }

  const handleRemoteCommand = useCallback(async (command: SallyCommand, label: string) => {
    setCommandPending(command.type)
    setCommandStatus(`${label} sending`)

    try {
      const response = await fetch("/api/local/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      })
      const result = await response.json().catch(() => ({}))
      const remoteResult = result?.result as { ok?: boolean; error?: string } | undefined

      if (!response.ok || remoteResult?.ok === false) {
        const error = remoteResult?.error || result?.error || "Unavailable"
        setCommandStatus(`${label}: ${error}`)
        return
      }

      applySallyPayloadSnapshots(result)
      setCommandStatus(`${label} sent`)
    } catch (error) {
      setCommandStatus(`${label}: ${error instanceof Error ? error.message : "failed"}`)
    } finally {
      setCommandPending(null)
    }
  }, [applySallyPayloadSnapshots])

  const handleResumeClick = () => {
    handleTransport("play")
    void handleRemoteCommand({ type: "spotify_resume" }, "Resume")
  }

  const handlePauseClick = () => {
    handleTransport("pause")
    void handleRemoteCommand({ type: "spotify_pause" }, "Pause")
  }

  const handleNextClick = () => {
    handleTransport("skipForward")
    void handleRemoteCommand({ type: "spotify_next" }, "Next")
  }

  const handleVolumePresetClick = () => {
    handleVolumeChange(BAMBOO_VOLUME_PRESET)
    void handleRemoteCommand({ type: "set_volume", percent: BAMBOO_VOLUME_PRESET }, `Volume ${BAMBOO_VOLUME_PRESET}%`)
  }

  const handleCrossfaderChange = (value: number) => {
    setCrossfader(value)
    setDeckAGain(Math.max(0, 100 - value))
    setDeckBGain(value)
  }

  const handleAutoTransition = () => {
    setCrossfader(50)
    setDeckAGain(70)
    setDeckBGain(70)
    setCommandStatus("Transition staged")
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Disc3 className="h-10 w-10 text-[#ed4c4c] animate-spin" style={{ animationDuration: "3s" }} />
              <div className="absolute inset-0 bg-[#ed4c4c]/20 blur-xl rounded-full" />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">DJ Sally</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50">
              <span className="text-xs text-muted-foreground">BPM</span>
              <span className="text-sm font-mono font-bold text-primary">{bpm}</span>
            </div>

            <Button
              variant={status === "connected" ? "default" : "outline"}
              size="sm"
              onClick={status === "connected" ? disconnect : () => connect()}
              className={cn(
                "gap-2 transition-all",
                status === "connected" && "bg-primary/20 text-primary border-primary/50 hover:bg-primary/30"
              )}
            >
              {status === "connected" ? (
                <>
                  <Wifi className="h-4 w-4" />
                  <span className="hidden sm:inline">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4" />
                  <span className="hidden sm:inline">Connect</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] p-4 space-y-4">
        {/* Waveform Display */}
        <Card className="relative overflow-hidden border-border/50 bg-card/50 backdrop-blur p-4">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
          <div className="relative flex items-end justify-center h-24 gap-[2px]">
            {waveformBars.map((height, i) => (
              <div
                key={i}
                className="w-2 rounded-t transition-all duration-75"
                style={{
                  height: `${Math.max(4, height)}%`,
                  background: `linear-gradient(to top, #ed4c4c, #ffd0cd)`,
                  opacity: 0.6 + (height / 200),
                }}
              />
            ))}
          </div>
          <div className="relative flex items-center justify-center gap-4 mt-4">
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => handleTransport("skipBack")}>
              <SkipBack className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              className="h-14 w-14 rounded-full bg-[#ed4c4c] hover:bg-[#ed4c4c]/90 text-white shadow-lg shadow-[#ed4c4c]/25"
              onClick={() => handleTransport(isPlaying ? "pause" : "play")}
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => handleTransport("skipForward")}>
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>
        </Card>

        <WorkflowReadinessPanel />

        {/* Sally Remote Controls */}
        <Card className="border-border/50 bg-card/50 backdrop-blur p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <span className="shrink-0 text-sm font-medium">Sally Remote</span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">{commandStatus}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Button variant="outline" size="sm" className="gap-2" onClick={handleResumeClick}>
                <Play className="h-4 w-4" />
                Resume
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handlePauseClick}>
                <Pause className="h-4 w-4" />
                Pause
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleNextClick}>
                <SkipForward className="h-4 w-4" />
                Next
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleVolumePresetClick}>
                <Volume2 className="h-4 w-4" />
                {BAMBOO_VOLUME_PRESET}%
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={commandPending === "open_spotify"}
                onClick={() => void handleRemoteCommand({ type: "open_spotify", uri: CURRENT_PLAYLIST_URI }, "Playlist")}
              >
                <Music className="h-4 w-4" />
                Playlist
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={commandPending === "recover_playback"}
                onClick={() => void handleRemoteCommand({ type: "recover_playback" }, "Recover")}
              >
                <RotateCcw className="h-4 w-4" />
                Recover
              </Button>
            </div>
          </div>
        </Card>

        {/* Main Grid */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left Deck - Macro Pad 1 */}
          <div className="lg:col-span-4 space-y-4">
            <DeckCard
              title="Deck A"
              subtitle="Now Playing"
              connected={deviceState.macroPads[0]?.connected}
              encoderValue={deviceState.macroPads[0]?.encoder.value ?? 50}
              onEncoderChange={(v) => handleEncoderChange(1, v)}
              buttons={deviceState.macroPads[0]?.buttons ?? []}
              onButtonPress={(id) => handleButtonPress(1, id)}
              accentColor="primary"
              track={nowPlaying}
              deckRole="live"
              isPlaying={spotifyState.isPlaying || isPlaying}
              contextLabel={formatContextLabel(spotifyState.contextType, spotifyState.contextUri)}
              level={Math.round((deckABalance * deckAGain) / 100)}
              onPrimaryAction={handleResumeClick}
              primaryActionLabel="Resume"
            />
          </div>

          {/* Center - Mixer & Cameras */}
          <div className="lg:col-span-4 space-y-4">
            {/* Virtual Mixer */}
            <Card className="border-border/50 bg-card/50 backdrop-blur p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Virtual Mixer</span>
                </div>
                <span className="rounded border border-border/50 bg-secondary/30 px-2 py-1 font-mono text-xs text-muted-foreground">
                  A {deckABalance}% / B {deckBBalance}%
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Crossfader</span>
                    <span className="font-mono">{crossfader < 50 ? "Deck A" : crossfader > 50 ? "Deck B" : "Blend"}</span>
                  </div>
                  <Slider value={[crossfader]} onValueChange={([v]) => handleCrossfaderChange(v)} max={100} step={1} />
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>A</span>
                    <span>B</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DeckMixControl label="Deck A" value={deckAGain} onChange={setDeckAGain} />
                  <DeckMixControl label="Deck B" value={deckBGain} onChange={setDeckBGain} />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Transition Curve</span>
                    <span className="font-mono">{transitionCurve}%</span>
                  </div>
                  <Slider value={[transitionCurve]} onValueChange={([v]) => setTransitionCurve(v)} max={100} step={1} />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleCrossfaderChange(0)}>Cut A</Button>
                  <Button variant="outline" size="sm" onClick={handleAutoTransition}>Blend</Button>
                  <Button variant="outline" size="sm" onClick={() => handleCrossfaderChange(100)}>Cut B</Button>
                </div>
              </div>
            </Card>

            {/* Master Volume */}
            <Card className="border-border/50 bg-card/50 backdrop-blur p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Bamboo / Samsung Output</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleMuteToggle}
                >
                  {deviceState.speaker.muted ? (
                    <VolumeX className="h-4 w-4 text-destructive" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-primary" />
                  )}
                </Button>
              </div>

              <div className="flex gap-3">
                {/* Volume Slider */}
                <div className="flex-1 flex items-center gap-3">
                  <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#ed4c4c] to-[#faa09a] transition-all"
                      style={{ width: `${outputVolume}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono w-10 text-right text-muted-foreground">
                    {outputVolume}%
                  </span>
                </div>
              </div>

              <Slider
                value={[outputVolume]}
                onValueChange={([v]) => handleVolumeChange(v)}
                max={100}
                step={1}
                className="mt-3"
              />

              {/* VU Meter */}
              <div className="flex gap-1 mt-4">
                {Array(20).fill(0).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 h-2 rounded-sm transition-all",
                      i < (outputVolume / 5)
                        ? i > 15
                          ? "bg-[#ed4c4c]"
                          : i > 12
                            ? "bg-[#faa09a]"
                            : "bg-[#ffd0cd]"
                        : "bg-secondary"
                    )}
                  />
                ))}
              </div>
            </Card>

            {/* Camera Feeds */}
            <Card className="border-border/50 bg-card/50 backdrop-blur p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">Live Feeds</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    deviceState.cameras.ptz.connected ? "bg-primary animate-pulse" : "bg-muted"
                  )} />
                  <span className="text-xs text-muted-foreground">
                    {deviceState.cameras.ptz.connected ? "LIVE" : "OFF"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* PTZ Camera */}
                <div className="relative aspect-video rounded-lg bg-secondary/50 border border-border/50 overflow-hidden group">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  {deviceState.cameras.ptz.connected && (
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-destructive/80 text-[10px] font-medium">
                      REC
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 text-[10px] text-muted-foreground">
                    PTZ Cam
                  </div>
                </div>

                {/* Webcam */}
                <div className="relative aspect-video rounded-lg bg-secondary/50 border border-border/50 overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  <div className="absolute bottom-2 left-2 text-[10px] text-muted-foreground">
                    Webcam
                  </div>
                </div>
              </div>

              {/* PTZ Controls */}
              <div className="mt-3 flex items-center justify-center gap-2">
                <div className="grid grid-cols-3 gap-1">
                  <div />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => sendPTZ("up")}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <div />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => sendPTZ("left")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="h-8 w-8 rounded bg-secondary/50 border border-border/50" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => sendPTZ("right")}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => sendPTZ("down")}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <div />
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePTZControl("zoomIn")}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePTZControl("zoomOut")}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* System Status */}
            <Card className="border-border/50 bg-card/50 backdrop-blur p-4">
              <div className="flex items-center gap-2 mb-3">
                <Radio className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">System</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <StatusItem
                  label="CPU"
                  value={`${deviceState.raspberryPi.cpuUsage}%`}
                  color={deviceState.raspberryPi.cpuUsage > 80 ? "destructive" : "primary"}
                />
                <StatusItem
                  label="Temp"
                  value={`${deviceState.raspberryPi.cpuTemp}°`}
                  color={deviceState.raspberryPi.cpuTemp > 70 ? "destructive" : "primary"}
                />
                <StatusItem
                  label="RAM"
                  value={`${deviceState.raspberryPi.memoryUsage}%`}
                  color={deviceState.raspberryPi.memoryUsage > 80 ? "destructive" : "primary"}
                />
              </div>
            </Card>
          </div>

          {/* Right Deck - Macro Pad 2 */}
          <div className="lg:col-span-4 space-y-4">
            <DeckCard
              title="Deck B"
              subtitle="Incoming"
              connected={deviceState.macroPads[1]?.connected}
              encoderValue={deviceState.macroPads[1]?.encoder.value ?? 50}
              onEncoderChange={(v) => handleEncoderChange(2, v)}
              buttons={deviceState.macroPads[1]?.buttons ?? []}
              onButtonPress={(id) => handleButtonPress(2, id)}
              accentColor="accent"
              track={incomingTrack}
              deckRole={spotifyState.incoming ? "queued" : "standby"}
              isPlaying={false}
              contextLabel={spotifyState.incoming ? "Spotify Queue" : "Playlist Cue"}
              level={Math.round((deckBBalance * deckBGain) / 100)}
              onPrimaryAction={() => void handleRemoteCommand({ type: "spotify_next" }, "Next")}
              primaryActionLabel="Play Next"
            />
          </div>
        </div>

        {/* Effects Row */}
        <Card className="border-border/50 bg-card/50 backdrop-blur p-4">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium">Quick Effects</span>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {["Filter", "Echo", "Reverb", "Flanger", "Phaser", "Delay", "Loop", "Roll"].map((effect) => (
              <Button
                key={effect}
                variant="outline"
                className="h-12 border-border/50 hover:bg-[#ed4c4c]/10 hover:border-[#ed4c4c]/50 hover:text-[#ed4c4c] transition-all"
                onClick={() => handleEffectClick(effect)}
              >
                <span className="text-xs">{effect}</span>
              </Button>
            ))}
          </div>
        </Card>

        {/* Hardware Setup */}
        <Card className="border-border/50 bg-card/50 backdrop-blur p-4">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Hardware Setup</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(deviceState.hidSetup?.decks ?? []).map((deck) => (
              <div key={deck.pad} className="rounded border border-border/50 bg-secondary/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{deck.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      events: {(deck.eventPaths?.length ? deck.eventPaths : [deck.eventPath]).join(", ")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      raw: {(deck.rawPaths?.length ? deck.rawPaths : [deck.rawPath]).join(", ")}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      deviceState.macroPads[deck.pad - 1]?.connected ? "bg-[#ed4c4c]" : "bg-muted"
                    )}
                  />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {getDeckButtonMapping(deck.pad).map((control, index) => (
                    <div
                      key={control.label}
                      className={cn(
                        "rounded border border-border/50 px-2 py-2 text-center",
                        deviceState.macroPads[deck.pad - 1]?.buttons[index]?.pressed
                          ? "bg-[#ed4c4c] text-white"
                          : "bg-background/50"
                      )}
                    >
                      <p className="text-xs font-medium">{control.label}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{control.position}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {control.key} / {control.code}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {getDeckKnobMapping(deck.pad).map((control) => (
                    <div
                      key={control.label}
                      className={cn(
                        "rounded border border-border/50 px-2 py-2 text-center",
                        deck.lastKnob?.includes(control.match) ? "bg-[#ed4c4c] text-white" : "bg-background/50"
                      )}
                    >
                      <p className="text-xs font-medium">{control.label}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {control.key} / {control.code}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 space-y-1 font-mono text-[11px] text-muted-foreground">
                  <p>event: {deck.lastEvent ?? "waiting"}</p>
                  <p>knob: {deck.lastKnob ?? "waiting"} {deck.knobPressed ? "(held)" : ""}</p>
                  <p>source: {deck.lastSource ?? "--"}</p>
                  <p className="break-all">raw: {deck.lastHex ?? "--"}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background/80 backdrop-blur mt-4">
        <div className="mx-auto max-w-[1800px] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Raspberry Pi: {deviceState.raspberryPi.connected ? "Online" : "Offline"}</span>
            <span>Latency: 12ms</span>
          </div>
          <div className="flex items-center gap-2">
            <Music className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">v1.0.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function getDeckButtonMapping(pad: number) {
  return pad === 1
    ? [
        { label: "CUE", position: "farthest", key: "F13", code: 183 },
        { label: "PLAY", position: "middle", key: "F14", code: 184 },
        { label: "SYNC", position: "closest", key: "F15", code: 185 },
      ]
    : [
        { label: "CUE", position: "farthest", key: "F19", code: 189 },
        { label: "PLAY", position: "middle", key: "F20", code: 190 },
        { label: "SYNC", position: "closest", key: "F21", code: 191 },
      ]
}

function getDeckKnobMapping(pad: number) {
  return pad === 1
    ? [
        { label: "Knob Left", key: "F16", code: 186, match: "rotate left" },
        { label: "Knob Click", key: "F17", code: 187, match: "knob click" },
        { label: "Knob Right", key: "F18", code: 188, match: "rotate right" },
      ]
    : [
        { label: "Knob Left", key: "F22", code: 192, match: "rotate left" },
        { label: "Knob Click", key: "F23", code: 193, match: "knob click" },
        { label: "Knob Right", key: "F24", code: 194, match: "rotate right" },
      ]
}

function getIncomingFallback(nowPlaying: DeckTrack | null): DeckTrack {
  return {
    name: nowPlaying ? "Next from UK Garage and Bassline Bangers" : "UK Garage and Bassline Bangers",
    uri: CURRENT_PLAYLIST_URI,
    artists: nowPlaying ? ["Spotify playlist queue"] : ["Ready to load"],
    album: "Incoming cue",
    image: null,
  }
}

function formatContextLabel(type: string | null, uri: string | null) {
  if (!type && !uri) return "Spotify"
  if (!uri) return type ?? "Spotify"
  const id = uri.split(":").at(-1)
  return `${type ?? "context"} ${id?.slice(0, 8) ?? ""}`.trim()
}

function normalizeSpotifyDeckState(payload: unknown): SpotifyDeckState | null {
  const spotify = findSpotifyObject(payload, new Set())
  if (!spotify) return null

  const queue = arrayField(spotify, "queue").flatMap((item) => {
    const track = normalizeDeckTrack(item)
    return track ? [track] : []
  })
  const nowPlaying = normalizeDeckTrack(spotify.track)
  const incoming = queue.find((track) => track.uri !== nowPlaying?.uri) ?? null
  const device = objectField(spotify, "device")
  const context = objectField(spotify, "context")

  return {
    isPlaying: Boolean(spotify.isPlaying),
    deviceName: stringField(device, "name"),
    contextUri: stringField(context, "uri"),
    contextType: stringField(context, "type"),
    nowPlaying,
    incoming,
    queue,
    updatedAt: new Date().toISOString(),
  }
}

function normalizeOutputVolume(payload: unknown): number | null {
  const volume = findOutputVolumeObject(payload, new Set())
  if (typeof volume === "number") return clampPercent(volume)
  if (!volume) return null

  return (
    numberField(volume, "effective_percent") ??
    numberField(volume, "android_music_percent") ??
    numberField(volume, "percent") ??
    numberField(volume, "current") ??
    null
  )
}

function findSpotifyObject(value: unknown, seen: Set<object>): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  const object = value as Record<string, unknown>
  if (seen.has(object)) return null
  seen.add(object)

  if ("isPlaying" in object && ("track" in object || "queue" in object || "context" in object)) {
    return object
  }

  for (const key of ["spotify", "result", "status", "lastStatus"]) {
    const child = object[key]
    const found = findSpotifyObject(child, seen)
    if (found) return found
  }

  for (const child of Object.values(object)) {
    const found = findSpotifyObject(child, seen)
    if (found) return found
  }
  return null
}

function findOutputVolumeObject(value: unknown, seen: Set<object>): Record<string, unknown> | number | null {
  if (typeof value === "number") return value
  if (!value || typeof value !== "object") return null

  const object = value as Record<string, unknown>
  if (seen.has(object)) return null
  seen.add(object)

  if ("effective_percent" in object || "android_music_percent" in object) {
    return object
  }

  const directVolume = object.volume
  if (typeof directVolume === "number") return directVolume
  if (directVolume && typeof directVolume === "object") return directVolume as Record<string, unknown>

  for (const key of ["result", "status", "lastStatus", "android_audio", "audio_route"]) {
    const found = findOutputVolumeObject(object[key], seen)
    if (found !== null) return found
  }

  return null
}

function normalizeDeckTrack(value: unknown): DeckTrack | null {
  const object = objectField({ value }, "value")
  if (!object) return null
  const name = stringField(object, "name")
  const uri = stringField(object, "uri")
  if (!name || !uri) return null

  return {
    id: stringField(object, "id") ?? undefined,
    name,
    uri,
    artists: arrayField(object, "artists").flatMap((artist) => typeof artist === "string" ? [artist] : []),
    album: stringField(object, "album"),
    image: stringField(object, "image"),
  }
}

function objectField(object: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = object[key]
  return value && typeof value === "object" ? value as Record<string, unknown> : null
}

function stringField(object: Record<string, unknown> | null, key: string): string | null {
  if (!object) return null
  const value = object[key]
  return typeof value === "string" && value.trim() ? value : null
}

function numberField(object: Record<string, unknown>, key: string): number | null {
  const value = object[key]
  return typeof value === "number" ? clampPercent(value) : null
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function arrayField(object: Record<string, unknown>, key: string): unknown[] {
  const value = object[key]
  return Array.isArray(value) ? value : []
}

function DeckMixControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="rounded border border-border/50 bg-secondary/20 p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value}%</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} max={100} step={1} />
    </div>
  )
}

// Deck Card Component
function DeckCard({
  title,
  subtitle,
  connected,
  encoderValue,
  onEncoderChange,
  buttons,
  onButtonPress,
  accentColor,
  track,
  deckRole,
  isPlaying,
  contextLabel,
  level,
  onPrimaryAction,
  primaryActionLabel,
}: {
  title: string
  subtitle: string
  connected?: boolean
  encoderValue: number
  onEncoderChange: (value: number) => void
  buttons: { id: number; pressed?: boolean; active?: boolean; label: string }[]
  onButtonPress: (id: number) => void
  accentColor: "primary" | "accent"
  track?: DeckTrack | null
  deckRole?: "live" | "queued" | "standby"
  isPlaying?: boolean
  contextLabel?: string
  level?: number
  onPrimaryAction?: () => void
  primaryActionLabel?: string
}) {
  const accent = accentColor === "primary" ? "#ed4c4c" : "#faa09a"
  const artists = track?.artists?.length ? track.artists.join(", ") : "No artist"
  const levelValue = Math.max(0, Math.min(100, level ?? encoderValue))

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={cn(
            "text-lg font-bold font-[family-name:var(--font-grandstander)]",
            accentColor === "primary" ? "text-[#ed4c4c]" : "text-[#faa09a]"
          )}>{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className={cn(
          "h-2 w-2 rounded-full",
          connected ? (accentColor === "primary" ? "bg-[#ed4c4c]" : "bg-[#faa09a]") : "bg-muted"
        )} />
      </div>

      <div className="mb-4 rounded border border-border/50 bg-secondary/20 p-3">
        <div className="flex gap-3">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded border border-border/50 bg-background/50">
            {track?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={track.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Disc3 className={cn("h-9 w-9", accentColor === "primary" ? "text-[#ed4c4c]/60" : "text-[#faa09a]/60")} />
              </div>
            )}
            {isPlaying && (
              <div className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#ed4c4c] shadow-lg shadow-[#ed4c4c]/50" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded border border-border/50 bg-background/50 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {deckRole ?? "standby"}
              </span>
              <span className="min-w-0 truncate text-[10px] text-muted-foreground">{contextLabel ?? "Spotify"}</span>
            </div>
            <p className="truncate text-sm font-semibold">{track?.name ?? "No Spotify track loaded"}</p>
            <p className="truncate text-xs text-muted-foreground">{artists}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{track?.album ?? "Waiting for playback state"}</p>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Deck level</span>
            <span className="font-mono">{levelValue}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-background/60">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${levelValue}%`, backgroundColor: accent }}
            />
          </div>
        </div>

        {onPrimaryAction && (
          <Button variant="outline" size="sm" className="mt-3 w-full gap-2" onClick={onPrimaryAction}>
            <Play className="h-4 w-4" />
            {primaryActionLabel ?? "Load"}
          </Button>
        )}
      </div>

      {/* Turntable Visual */}
      <div className="relative mx-auto w-40 h-40 mb-4">
        <div className="absolute inset-0 rounded-full bg-secondary/50 border border-border/50" />
        <div
          className={cn(
            "absolute inset-2 rounded-full border-2",
            accentColor === "primary" ? "border-[#ed4c4c]/30" : "border-[#faa09a]/30"
          )}
          style={{
            background: `conic-gradient(from ${encoderValue * 3.6}deg, transparent, ${accentColor === "primary" ? "#ed4c4c" : "#faa09a"} 10%, transparent 20%)`,
          }}
        />
        <div className="absolute inset-8 rounded-full bg-card border border-border/50 flex items-center justify-center">
          <Disc3 className={cn(
            "h-12 w-12",
            accentColor === "primary" ? "text-[#ed4c4c]/50" : "text-[#faa09a]/50"
          )} />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground" />
      </div>

      {/* Encoder Slider */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>Jog</span>
          <span className="font-mono">{encoderValue}</span>
        </div>
        <Slider
          value={[encoderValue]}
          onValueChange={([v]) => onEncoderChange(v)}
          max={100}
          step={1}
          className={accentColor === "primary" ? "[&_[role=slider]]:bg-[#ed4c4c]" : "[&_[role=slider]]:bg-[#faa09a]"}
        />
      </div>

      {/* Pad Buttons */}
      <div className="grid grid-cols-4 gap-2">
        {(buttons.length > 0 ? buttons : Array(4).fill({ id: 0, active: false, label: "" })).map((btn, i) => (
          <Button
            key={i}
            variant={btn.pressed || btn.active ? "default" : "outline"}
            className={cn(
              "h-12 p-0 border-border/50 transition-all",
              (btn.pressed || btn.active) && (accentColor === "primary"
                ? "bg-[#ed4c4c] text-white shadow-lg shadow-[#ed4c4c]/25"
                : "bg-[#faa09a] text-black shadow-lg shadow-[#faa09a]/25"),
              !(btn.pressed || btn.active) && "hover:bg-secondary"
            )}
            onClick={() => onButtonPress(btn.id || i)}
          >
            <span className="text-xs font-mono">{btn.label || i + 1}</span>
          </Button>
        ))}
      </div>
    </Card>
  )
}

// Status Item Component
function StatusItem({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: "primary" | "destructive"
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn(
        "text-lg font-mono font-bold",
        color === "primary" ? "text-[#ed4c4c]" : "text-[#faa09a]"
      )}>{value}</p>
    </div>
  )
}
