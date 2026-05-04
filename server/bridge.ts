import { spawn } from "node:child_process"
import { createReadStream, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { WebSocketServer, WebSocket } from "ws"
import { resolveDjSallyHidDecks } from "../lib/hid-device-mapping"

loadEnvFiles()

// Environment variables
const SALLY_REMOTE_CONTROL_URL = process.env.SALLY_REMOTE_CONTROL_URL || "http://127.0.0.1:8787"
const SALLY_DEVICE_ID = process.env.SALLY_DEVICE_ID || "sally-samsung"
const SALLY_ADMIN_TOKEN = process.env.SALLY_ADMIN_TOKEN
const SALLY_COMMAND_PROXY_URL = process.env.SALLY_COMMAND_PROXY_URL
const DJ_SALLY_WS_PORT = parseInt(process.env.DJ_SALLY_WS_PORT || "8080", 10)
const SALLY_WAIT_MS = parseInt(process.env.SALLY_WAIT_MS || "45000", 10)
const SALLY_STATUS_POLL_MS = parseInt(process.env.SALLY_STATUS_POLL_MS || "10000", 10)
const MUBIT_DJ_LOGGING_ENABLED = process.env.MUBIT_DJ_LOGGING_ENABLED !== "0"
const MUBIT_REMEMBER_SCRIPT =
  process.env.MUBIT_REMEMBER_SCRIPT || `${process.env.HOME || "/home/hs-chilu"}/heysalad-agent-integrations/scripts/mubit-remember.mjs`
const MUBIT_NODE = process.env.MUBIT_NODE || "/usr/bin/node"
const HID_ENABLED = process.env.DJ_SALLY_HID_ENABLED !== "0"
const HID_AUTO_MAPPING = resolveDjSallyHidDecks({
  vendorId: process.env.DJ_SALLY_HID_VENDOR_ID,
  productId: process.env.DJ_SALLY_HID_PRODUCT_ID,
  deckAUsbDevice: process.env.DJ_SALLY_HID_DECK_A_USB_DEVICE,
  deckBUsbDevice: process.env.DJ_SALLY_HID_DECK_B_USB_DEVICE,
})
const HID_DECK_A_AUTO = HID_AUTO_MAPPING.decks.find((deck) => deck.pad === 1)
const HID_DECK_B_AUTO = HID_AUTO_MAPPING.decks.find((deck) => deck.pad === 2)
const HID_DECK_A_KEYBOARD =
  process.env.DJ_SALLY_HID_DECK_A_KEYBOARD ||
  HID_DECK_A_AUTO?.keyboardPaths[1] ||
  "/dev/input/by-path/pci-0000:00:14.0-usb-0:2:1.2-event-kbd"
const HID_DECK_A_KEYBOARD_PRIMARY =
  process.env.DJ_SALLY_HID_DECK_A_KEYBOARD_PRIMARY ||
  HID_DECK_A_AUTO?.keyboardPaths[0] ||
  "/dev/input/by-path/pci-0000:00:14.0-usb-0:2:1.0-event-kbd"
const HID_DECK_A_ENCODER =
  process.env.DJ_SALLY_HID_DECK_A_ENCODER ||
  HID_DECK_A_AUTO?.encoderPath ||
  "/dev/input/by-path/pci-0000:00:14.0-usb-0:2:1.3-event-mouse"
const HID_DECK_B_KEYBOARD =
  process.env.DJ_SALLY_HID_DECK_B_KEYBOARD ||
  HID_DECK_B_AUTO?.keyboardPaths[1] ||
  "/dev/input/by-path/pci-0000:00:14.0-usb-0:3:1.2-event-kbd"
const HID_DECK_B_KEYBOARD_PRIMARY =
  process.env.DJ_SALLY_HID_DECK_B_KEYBOARD_PRIMARY ||
  HID_DECK_B_AUTO?.keyboardPaths[0] ||
  "/dev/input/by-path/pci-0000:00:14.0-usb-0:3:1.0-event-kbd"
const HID_DECK_B_ENCODER =
  process.env.DJ_SALLY_HID_DECK_B_ENCODER ||
  HID_DECK_B_AUTO?.encoderPath ||
  "/dev/input/by-path/pci-0000:00:14.0-usb-0:3:1.3-event-mouse"
const HID_DECK_A_RAW = process.env.DJ_SALLY_HID_DECK_A_RAW || HID_DECK_A_AUTO?.rawPaths[0] || "/dev/hidraw4"
const HID_DECK_B_RAW = process.env.DJ_SALLY_HID_DECK_B_RAW || HID_DECK_B_AUTO?.rawPaths[0] || "/dev/hidraw1"
const HID_DECK_A_RAWS = parsePathList(
  process.env.DJ_SALLY_HID_DECK_A_RAWS,
  HID_DECK_A_AUTO?.rawPaths?.length ? HID_DECK_A_AUTO.rawPaths : [HID_DECK_A_RAW, "/dev/hidraw5", "/dev/hidraw6"]
)
const HID_DECK_B_RAWS = parsePathList(
  process.env.DJ_SALLY_HID_DECK_B_RAWS,
  HID_DECK_B_AUTO?.rawPaths?.length ? HID_DECK_B_AUTO.rawPaths : [HID_DECK_B_RAW, "/dev/hidraw2", "/dev/hidraw3"]
)
const HID_DECK_A_KEYBOARDS = parsePathList(process.env.DJ_SALLY_HID_DECK_A_KEYBOARDS, [
  HID_DECK_A_KEYBOARD_PRIMARY,
  HID_DECK_A_KEYBOARD,
])
const HID_DECK_B_KEYBOARDS = parsePathList(process.env.DJ_SALLY_HID_DECK_B_KEYBOARDS, [
  HID_DECK_B_KEYBOARD_PRIMARY,
  HID_DECK_B_KEYBOARD,
])
const HID_BUTTON_MAP = parseButtonMap(process.env.DJ_SALLY_HID_BUTTON_MAP)
const HID_KNOB_TARGET = process.env.DJ_SALLY_HID_KNOB_TARGET || "volume"
const HID_VOLUME_STEP = parseClampedInt(process.env.DJ_SALLY_HID_VOLUME_STEP, 2, 1, 20)
const HID_VOLUME_SEND_DEBOUNCE_MS = parseClampedInt(process.env.DJ_SALLY_HID_VOLUME_SEND_DEBOUNCE_MS, 150, 0, 2000)
const HID_VOLUME_DIRECTION = process.env.DJ_SALLY_HID_VOLUME_INVERT === "1" ? -1 : 1
const INPUT_EVENT_SIZE = 24
const EV_KEY = 1
const EV_REL = 2
const KEY_RELEASE = 0
const KEY_PRESS = 1
const KEY_REPEAT = 2
const REL_X = 0
const REL_Y = 1
const REL_WHEEL = 8
const BTN_LEFT = 272
const BTN_MIDDLE = 274
const MODIFIER_KEY_CODES = new Set([29, 42, 54, 56, 97, 100, 125, 126])
const PROGRAMMED_KEY_CONTROLS = new Map<string, { kind: "button" | "knob"; button?: number; direction?: "left" | "right"; pressed?: boolean }>([
  ["1:183", { kind: "button", button: 0 }],
  ["1:184", { kind: "button", button: 1 }],
  ["1:185", { kind: "button", button: 2 }],
  ["1:186", { kind: "knob", direction: "left" }],
  ["1:187", { kind: "knob", pressed: true }],
  ["1:188", { kind: "knob", direction: "right" }],
  ["2:189", { kind: "button", button: 0 }],
  ["2:190", { kind: "button", button: 1 }],
  ["2:191", { kind: "button", button: 2 }],
  ["2:192", { kind: "knob", direction: "left" }],
  ["2:193", { kind: "knob", pressed: true }],
  ["2:194", { kind: "knob", direction: "right" }],
])

// Device state
interface DeviceState {
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
      usbDevice?: string
      mappingSource?: "sysfs" | "fallback"
      learnedCodes: number[]
      lastEvent: string | null
      lastHex: string | null
      lastSource?: string | null
      lastKnob?: string | null
      knobPressed?: boolean
    }[]
  }
}

interface SpotifyTrackState {
  id?: string
  name: string
  uri: string
  artists: string[]
  album: string | null
  image?: string | null
}

interface SpotifyState {
  isPlaying: boolean
  deviceName: string | null
  contextUri: string | null
  contextType: string | null
  nowPlaying: SpotifyTrackState | null
  incoming: SpotifyTrackState | null
  queue: SpotifyTrackState[]
  updatedAt: string | null
}

let deviceState: DeviceState = {
  raspberryPi: { connected: true, cpuTemp: 0, cpuUsage: 0, memoryUsage: 0 },
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
    enabled: HID_ENABLED,
    decks: [
      {
        pad: 1,
        label: "Deck A",
        rawPath: HID_DECK_A_RAWS[0] ?? HID_DECK_A_RAW,
        rawPaths: HID_DECK_A_RAWS,
        eventPath: HID_DECK_A_KEYBOARDS[0] ?? HID_DECK_A_KEYBOARD,
        eventPaths: [...HID_DECK_A_KEYBOARDS, HID_DECK_A_ENCODER],
        usbDevice: HID_DECK_A_AUTO?.usbDevice,
        mappingSource: HID_AUTO_MAPPING.source,
        learnedCodes: [],
        lastEvent: null,
        lastHex: null,
        lastSource: null,
        lastKnob: null,
        knobPressed: false,
      },
      {
        pad: 2,
        label: "Deck B",
        rawPath: HID_DECK_B_RAWS[0] ?? HID_DECK_B_RAW,
        rawPaths: HID_DECK_B_RAWS,
        eventPath: HID_DECK_B_KEYBOARDS[0] ?? HID_DECK_B_KEYBOARD,
        eventPaths: [...HID_DECK_B_KEYBOARDS, HID_DECK_B_ENCODER],
        usbDevice: HID_DECK_B_AUTO?.usbDevice,
        mappingSource: HID_AUTO_MAPPING.source,
        learnedCodes: [],
        lastEvent: null,
        lastHex: null,
        lastSource: null,
        lastKnob: null,
        knobPressed: false,
      },
    ],
  },
}

// Previous volume for mute/unmute restore
let previousVolume = 65

// Connected clients
const clients = new Set<WebSocket>()
const learnedButtonCodes = new Map<number, number[]>()
const knobPressed = new Map<number, boolean>()
const buttonPulseTimers = new Map<string, NodeJS.Timeout>()
let hidVolumeSendTimer: NodeJS.Timeout | null = null
let mubitUnavailableLogged = false

interface InputEvent {
  type: number
  code: number
  value: number
}

function startHidReaders() {
  if (!HID_ENABLED) {
    console.log("[HID] Disabled")
    return
  }

  if (HID_AUTO_MAPPING.source === "sysfs") {
    console.log(
      "[HID] Auto-mapped decks:",
      HID_AUTO_MAPPING.decks.map((deck) => `${deck.label}=${deck.usbDevice}`).join(", ")
    )
  } else {
    console.log(`[HID] Using fallback HID paths: ${HID_AUTO_MAPPING.reason ?? "auto mapping unavailable"}`)
  }

  for (const path of HID_DECK_A_KEYBOARDS) startKeyboardReader(1, path)
  startEncoderReader(1, HID_DECK_A_ENCODER)
  for (const path of HID_DECK_A_RAWS) startRawHidReader(1, path)
  for (const path of HID_DECK_B_KEYBOARDS) startKeyboardReader(2, path)
  startEncoderReader(2, HID_DECK_B_ENCODER)
  for (const path of HID_DECK_B_RAWS) startRawHidReader(2, path)
}

function startRawHidReader(pad: number, path: string) {
  if (!existsSync(path)) {
    updateHidSetup(pad, `raw missing: ${path}`, null, path)
    console.log(`[HID] Deck ${pad} raw missing: ${path}`)
    return
  }

  const stream = createReadStream(path, { highWaterMark: 64 })
  stream.on("data", (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const hex = buffer.toString("hex")
    const codes = [...buffer.subarray(3)].filter((code) => code > 0)
    updateHidSetup(pad, codes.length ? `raw codes ${codes.join(", ")}` : "raw release", hex, path)

    broadcastState()
  })

  stream.on("open", () => {
    updateHidSetup(pad, `raw listening: ${path}`, null, path)
    console.log(`[HID] Deck ${pad} raw listening on ${path}`)
    broadcastState()
  })

  stream.on("error", (error: NodeJS.ErrnoException) => {
    const message =
      error.code === "EACCES"
        ? `raw permission denied: ${path}`
        : `raw failed: ${path} ${error.message}`
    updateHidSetup(pad, message, null, path)
    console.error(`[HID] Deck ${pad} ${message}`)
    broadcastState()
  })
}

function startKeyboardReader(pad: number, path: string) {
  startInputReader(`Deck ${pad} keyboard`, path, (event) => {
    if (event.type !== EV_KEY || MODIFIER_KEY_CODES.has(event.code)) {
      return
    }

    if (handleProgrammedKeyControl(pad, event, path)) {
      return
    }

    if (event.value === KEY_REPEAT) {
      return
    }

    const button = resolveButtonIndex(pad, event.code)
    if (button === null) {
      console.log(`[HID] Deck ${pad} unmapped key code ${event.code}`)
      return
    }

    if (event.value !== KEY_PRESS && event.value !== KEY_RELEASE) {
      return
    }

    const deck = deviceState.macroPads[pad - 1]
    if (!deck?.buttons[button]) return

    deck.connected = true
    deck.buttons[button].pressed = event.value === KEY_PRESS
    updateHidSetup(pad, `event code ${event.code} ${deck.buttons[button].pressed ? "down" : "up"}`, null, path)
    console.log(
      `[HID] Deck ${pad} ${deck.buttons[button].label} ${deck.buttons[button].pressed ? "down" : "up"} code=${event.code}`
    )
    broadcastState()
  })
}

function handleProgrammedKeyControl(pad: number, event: InputEvent, path: string) {
  const control = PROGRAMMED_KEY_CONTROLS.get(`${pad}:${event.code}`)
  if (!control) return false

  const deck = deviceState.macroPads[pad - 1]
  if (!deck) return true

  deck.connected = true
  if (control.kind === "button" && control.button !== undefined && deck.buttons[control.button]) {
    const pressed = event.value === KEY_PRESS || event.value === KEY_REPEAT
    deck.buttons[control.button].pressed = pressed
    updateHidSetup(
      pad,
      `programmed ${deck.buttons[control.button].label} ${pressed ? "down" : "up"} code=${event.code}`,
      null,
      path
    )
    console.log(
      `[HID] Deck ${pad} programmed ${deck.buttons[control.button].label} ${pressed ? "down" : "up"} code=${event.code}`
    )
    if (pressed) scheduleButtonRelease(pad, control.button)
    broadcastState()
    return true
  }

  if (control.kind === "knob" && (event.value === KEY_PRESS || event.value === KEY_REPEAT)) {
    if (control.pressed) {
      knobPressed.set(pad, true)
      updateHidKnob(pad, `programmed knob click code=${event.code}`, true, path)
    } else if (control.direction) {
      const held = knobPressed.get(pad) === true
      applyKnobDelta(pad, control.direction === "right" ? 1 : -1, held, path, `programmed code=${event.code}`)
    }
    broadcastState()
    return true
  }

  if (control.kind === "knob" && control.pressed && event.value === KEY_RELEASE) {
    knobPressed.set(pad, false)
    updateHidKnob(pad, `programmed knob click up code=${event.code}`, false, path)
    broadcastState()
    return true
  }

  return true
}

function scheduleButtonRelease(pad: number, button: number) {
  const key = `${pad}:${button}`
  const existing = buttonPulseTimers.get(key)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    buttonPulseTimers.delete(key)
    const deck = deviceState.macroPads[pad - 1]
    if (!deck?.buttons[button]) return
    deck.buttons[button].pressed = false
    broadcastState()
  }, 600)
  timer.unref()
  buttonPulseTimers.set(key, timer)
}

function startEncoderReader(pad: number, path: string) {
  startInputReader(`Deck ${pad} encoder`, path, (event) => {
    if (event.type === EV_KEY && [BTN_LEFT, BTN_MIDDLE].includes(event.code)) {
      const pressed = event.value === KEY_PRESS
      knobPressed.set(pad, pressed)
      const deck = deviceState.macroPads[pad - 1]
      if (deck) deck.connected = true
      updateHidKnob(pad, `${pressed ? "knob click down" : "knob click up"} code=${event.code}`, pressed, path)
      console.log(`[HID] Deck ${pad} ${pressed ? "knob click down" : "knob click up"} code=${event.code}`)
      broadcastState()
      return
    }

    if (event.type !== EV_REL || ![REL_X, REL_Y, REL_WHEEL].includes(event.code) || event.value === 0) {
      return
    }

    const deck = deviceState.macroPads[pad - 1]
    if (!deck) return

    const held = knobPressed.get(pad) === true
    const direction = event.value > 0 ? "right" : "left"
    applyKnobDelta(pad, event.value, held, path, `code=${event.code} delta=${event.value}`)
    console.log(
      `[HID] Deck ${pad} ${held ? "click+" : ""}rotate ${direction} value=${deck.encoder.value} code=${event.code} delta=${event.value}`
    )
    broadcastState()
  })
}

function applyKnobDelta(pad: number, delta: number, held: boolean, source: string, detail: string) {
  const deck = deviceState.macroPads[pad - 1]
  if (!deck) return

  const direction = delta > 0 ? "right" : "left"
  deck.connected = true

  if (HID_KNOB_TARGET === "volume") {
    const nextVolume = clamp(deviceState.speaker.volume + delta * HID_VOLUME_DIRECTION * HID_VOLUME_STEP, 0, 100)
    deviceState.speaker.volume = nextVolume
    deviceState.speaker.muted = nextVolume <= 0
    deviceState.speaker.connected = true
    deck.encoder.value = nextVolume
    if (nextVolume > 0) previousVolume = nextVolume
    updateHidKnob(pad, `${held ? "click+" : ""}volume ${direction} ${detail} -> ${nextVolume}%`, held, source)
    scheduleHidVolumeSend(nextVolume)
    return
  }

  deck.encoder.value = clamp(deck.encoder.value + delta, deck.encoder.min, deck.encoder.max)
  updateHidKnob(pad, `${held ? "click+" : ""}rotate ${direction} ${detail}`, held, source)
}

function scheduleHidVolumeSend(percent: number) {
  if (hidVolumeSendTimer) clearTimeout(hidVolumeSendTimer)

  hidVolumeSendTimer = setTimeout(() => {
    hidVolumeSendTimer = null
    void sendToSally({ type: "set_volume", percent })
  }, HID_VOLUME_SEND_DEBOUNCE_MS)
  hidVolumeSendTimer.unref()
}

function startInputReader(label: string, path: string, onEvent: (event: InputEvent) => void) {
  if (!existsSync(path)) {
    console.log(`[HID] ${label} missing: ${path}`)
    return
  }

  const stream = createReadStream(path, { highWaterMark: INPUT_EVENT_SIZE * 16 })
  let pending = Buffer.alloc(0)

  stream.on("data", (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    pending = Buffer.concat([pending, buffer])
    while (pending.length >= INPUT_EVENT_SIZE) {
      const packet = pending.subarray(0, INPUT_EVENT_SIZE)
      pending = pending.subarray(INPUT_EVENT_SIZE)
      onEvent(parseInputEvent(packet))
    }
  })

  stream.on("open", () => {
    console.log(`[HID] ${label} listening on ${path}`)
  })

  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EACCES") {
      console.error(
        `[HID] ${label} permission denied for ${path}. Add hs-chilu to the input group or install a udev rule for 1189:8890.`
      )
      return
    }
    console.error(`[HID] ${label} failed for ${path}:`, error.message)
  })
}

function parseInputEvent(packet: Buffer): InputEvent {
  return {
    type: packet.readUInt16LE(16),
    code: packet.readUInt16LE(18),
    value: packet.readInt32LE(20),
  }
}

function resolveButtonIndex(pad: number, code: number): number | null {
  const configured = HID_BUTTON_MAP.get(`${pad}:${code}`)
  if (configured !== undefined) return configured

  const learned = learnedButtonCodes.get(pad) ?? []
  const existing = learned.indexOf(code)
  if (existing >= 0) return existing
  if (learned.length >= 3) return null

  learned.push(code)
  learnedButtonCodes.set(pad, learned)
  syncLearnedCodes(pad)
  console.log(`[HID] Deck ${pad} learned key code ${code} as button ${learned.length - 1}`)
  return learned.length - 1
}

function pulseButton(pad: number, code: number, source?: string) {
  const button = resolveButtonIndex(pad, code)
  if (button === null) {
    updateHidSetup(pad, `raw unmapped code ${code}`, null, source)
    console.log(`[HID] Deck ${pad} raw unmapped code ${code}`)
    return
  }

  const deck = deviceState.macroPads[pad - 1]
  if (!deck?.buttons[button]) return

  deck.connected = true
  deck.buttons[button].pressed = true
  updateHidSetup(pad, `raw code ${code} -> ${deck.buttons[button].label}`, null, source)
  console.log(`[HID] Deck ${pad} ${deck.buttons[button].label} pulse code=${code}`)
  setTimeout(() => {
    deck.buttons[button].pressed = false
    broadcastState()
  }, 180).unref()
}

function updateHidSetup(pad: number, lastEvent: string, lastHex: string | null, source?: string) {
  const deck = deviceState.hidSetup?.decks.find((value) => value.pad === pad)
  if (!deck) return
  deck.lastEvent = lastEvent
  if (lastHex !== null) deck.lastHex = lastHex
  if (source) deck.lastSource = source
  deck.learnedCodes = [...(learnedButtonCodes.get(pad) ?? [])]
}

function syncLearnedCodes(pad: number) {
  const deck = deviceState.hidSetup?.decks.find((value) => value.pad === pad)
  if (!deck) return
  deck.learnedCodes = [...(learnedButtonCodes.get(pad) ?? [])]
}

function updateHidKnob(pad: number, lastKnob: string, pressed: boolean, source?: string) {
  const deck = deviceState.hidSetup?.decks.find((value) => value.pad === pad)
  if (!deck) return
  deck.lastEvent = lastKnob
  deck.lastKnob = lastKnob
  deck.knobPressed = pressed
  if (source) deck.lastSource = source
}

function parseButtonMap(value: string | undefined): Map<string, number> {
  const result = new Map<string, number>()
  if (!value?.trim()) return result

  for (const deckPart of value.split(";")) {
    const [deckName, codesText] = deckPart.split(":")
    const pad = deckName?.trim().toUpperCase() === "B" ? 2 : 1
    const codes = codesText
      ?.split(",")
      .map((code) => parseInt(code.trim(), 10))
      .filter(Number.isFinite) ?? []
    codes.slice(0, 3).forEach((code, index) => result.set(`${pad}:${code}`, index))
  }
  return result
}

function parsePathList(value: string | undefined, fallback: string[]) {
  const paths = value
    ?.split(",")
    .map((path) => path.trim())
    .filter(Boolean)

  return paths?.length ? paths : fallback
}

function parseClampedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = value === undefined ? fallback : parseInt(value, 10)
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// Broadcast state to all clients
function broadcastState() {
  const message = JSON.stringify({
    type: "state_update",
    payload: deviceState,
  })

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

type SallyPayload = Record<string, unknown>

// Send command to Sally remote control API
async function sendToSally(command: SallyPayload): Promise<SallyPayload | null> {
  if (!SALLY_ADMIN_TOKEN) {
    console.log("[Bridge] SALLY_ADMIN_TOKEN not set, skipping Sally command:", command)
    void rememberDjSallyCommand(command, { ok: false, skipped: true, reason: "missing_sally_admin_token" })
    return null
  }

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), SALLY_WAIT_MS + 10000)
  timeout.unref()

  try {
    const response = await fetch(SALLY_COMMAND_PROXY_URL || sallyCommandUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SALLY_COMMAND_PROXY_URL ? {} : { Authorization: `Bearer ${SALLY_ADMIN_TOKEN}` }),
      },
      body: JSON.stringify(command),
      signal: abortController.signal,
    })

    const payload = await parseJsonResponse(response)
    if (!response.ok) {
      console.error("[Bridge] Sally command failed:", response.status, JSON.stringify(summarizeSallyPayload(payload)))
      void rememberDjSallyCommand(command, payload, `http_${response.status}`)
      return payload
    }
    if (payload.ok === false) {
      console.error("[Bridge] Sally command rejected:", JSON.stringify(summarizeSallyPayload(payload)))
      void rememberDjSallyCommand(command, payload, "rejected")
      return payload
    }

    applySallyPayloadState(payload)
    console.log("[Bridge] Sally command sent:", command)
    void rememberDjSallyCommand(command, payload)
    return payload
  } catch (error) {
    console.error("[Bridge] Failed to send Sally command:", error)
    void rememberDjSallyCommand(command, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function rememberDjSallyCommand(command: SallyPayload, payload: SallyPayload, failureType?: string) {
  if (!MUBIT_DJ_LOGGING_ENABLED) return

  const commandType = typeof command.type === "string" ? command.type : "unknown"
  const ok = payload.ok !== false && !payload.error && !failureType
  const result = summarizeSallyPayload(payload)
  const track = extractSpotifyTrack(payload)
  const provider = extractSpeechProvider(payload)
  const content = [
    `DJ Sally command ${commandType} ${ok ? "succeeded" : "failed"}.`,
    failureType ? `Failure type: ${failureType}.` : "",
    track ? `Spotify track: ${track}.` : "",
    provider ? `Speech provider: ${provider}.` : "",
    result.error ? `Error: ${String(result.error).slice(0, 220)}.` : "",
  ].filter(Boolean).join(" ")

  if (!existsSync(MUBIT_REMEMBER_SCRIPT)) {
    if (!mubitUnavailableLogged) {
      console.error("[Bridge] Mubit logging unavailable: helper script missing")
      mubitUnavailableLogged = true
    }
    return
  }

  const child = spawn(MUBIT_NODE, [MUBIT_REMEMBER_SCRIPT], {
    stdio: ["pipe", "ignore", "pipe"],
    env: process.env,
  })

  child.stdin.end(JSON.stringify({
    content,
    lessonType: ok ? "trace" : "failure",
    lessonScope: "project",
    importance: ok ? "low" : "high",
    metadata: {
      system: "dj-sally",
      command_type: commandType,
      ok,
    },
    upsertKey: `dj-sally-command-${commandType}-${ok ? "ok" : "failed"}-${Date.now()}`,
    wait: false,
  }))

  child.stderr.on("data", (chunk) => {
    if (!mubitUnavailableLogged) {
      console.error("[Bridge] Mubit logging failed:", String(chunk).trim())
      mubitUnavailableLogged = true
    }
  })
}

function extractSpotifyTrack(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const object = value as Record<string, unknown>
  const track = object.track && typeof object.track === "object" ? object.track as Record<string, unknown> : null
  if (track) {
    const name = typeof track.name === "string" ? track.name : null
    const artists = Array.isArray(track.artists) ? track.artists.filter((item) => typeof item === "string").join(", ") : null
    if (name) return artists ? `${name} by ${artists}` : name
  }
  for (const child of Object.values(object)) {
    const found = extractSpotifyTrack(child)
    if (found) return found
  }
  return null
}

function extractSpeechProvider(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const object = value as Record<string, unknown>
  if (typeof object.speech_provider === "string") return object.speech_provider
  for (const child of Object.values(object)) {
    const found = extractSpeechProvider(child)
    if (found) return found
  }
  return null
}

function sallyCommandUrl() {
  const base = SALLY_REMOTE_CONTROL_URL.replace(/\/$/, "")
  return `${base}/devices/${encodeURIComponent(SALLY_DEVICE_ID)}/command?wait_ms=${SALLY_WAIT_MS}`
}

function sallyStatusUrl() {
  const base = SALLY_REMOTE_CONTROL_URL.replace(/\/$/, "")
  return `${base}/devices/${encodeURIComponent(SALLY_DEVICE_ID)}/status`
}

async function refreshSallyStatus(): Promise<boolean> {
  if (!SALLY_ADMIN_TOKEN) return false

  try {
    const response = await fetch(sallyStatusUrl(), {
      headers: {
        Authorization: `Bearer ${SALLY_ADMIN_TOKEN}`,
      },
    })
    const payload = await parseJsonResponse(response)
    if (!response.ok) {
      console.error("[Bridge] Sally status failed:", response.status, JSON.stringify(summarizeSallyPayload(payload)))
      return false
    }
    return applySallyPayloadState(payload)
  } catch (error) {
    console.error("[Bridge] Failed to refresh Sally status:", error)
    return false
  }
}

async function parseJsonResponse(response: Response): Promise<SallyPayload> {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === "object" ? parsed as SallyPayload : { value: parsed }
  } catch {
    return { raw: text }
  }
}

function applySallyPayloadState(payload: unknown): boolean {
  const volume = findVolumeReport(payload)
  const spotify = findSpotifyState(payload)
  let changed = false

  if (volume) {
    deviceState.speaker.volume = volume.percent
    deviceState.speaker.muted = volume.percent <= 0
    deviceState.speaker.connected = true
    previousVolume = volume.percent > 0 ? volume.percent : previousVolume
    changed = true
  }

  if (spotify) {
    deviceState.spotify = spotify
    changed = true
  }

  if (changed) {
    broadcastState()
  }
  return changed
}

function findSpotifyState(payload: unknown): SpotifyState | null {
  const spotify = findObjectWithSpotifyFields(payload, new Set())
  if (!spotify) return null

  const queue = arrayField(spotify, "queue")
    .map(normalizeSpotifyTrack)
    .filter((track): track is SpotifyTrackState => Boolean(track))
  const nowPlaying = normalizeSpotifyTrack(spotify.track)
  const incoming = queue.find((track) => track.uri !== nowPlaying?.uri) ?? null
  const device = spotify.device && typeof spotify.device === "object" ? spotify.device as Record<string, unknown> : null
  const context = spotify.context && typeof spotify.context === "object" ? spotify.context as Record<string, unknown> : null

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

function findObjectWithSpotifyFields(value: unknown, seen: Set<object>): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  const object = value as Record<string, unknown>
  if (seen.has(object)) return null
  seen.add(object)

  if ("isPlaying" in object && ("track" in object || "queue" in object || "context" in object)) {
    return object
  }

  const likelySpotify = object.spotify
  if (likelySpotify && typeof likelySpotify === "object") {
    const found = findObjectWithSpotifyFields(likelySpotify, seen)
    if (found) return found
  }

  for (const child of Object.values(object)) {
    const found = findObjectWithSpotifyFields(child, seen)
    if (found) return found
  }
  return null
}

function normalizeSpotifyTrack(value: unknown): SpotifyTrackState | null {
  if (!value || typeof value !== "object") return null
  const object = value as Record<string, unknown>
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

function findVolumeReport(payload: unknown): { percent: number; source: string } | null {
  const volume = findObjectWithVolumeFields(payload, new Set())
  if (!volume) return null

  const android = numberField(volume, "android_music_percent")
  const effective = numberField(volume, "effective_percent")
  const spotify = numberField(volume, "spotify_connect_percent")
  const percent = android ?? effective ?? spotify
  if (percent === null) return null

  return {
    percent: clamp(Math.round(percent), 0, 100),
    source: android !== null ? "android_music_percent" : effective !== null ? "effective_percent" : "spotify_connect_percent",
  }
}

function findObjectWithVolumeFields(value: unknown, seen: Set<object>): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  const object = value as Record<string, unknown>
  if (seen.has(object)) return null
  seen.add(object)

  if (
    numberField(object, "android_music_percent") !== null ||
    numberField(object, "effective_percent") !== null ||
    numberField(object, "spotify_connect_percent") !== null
  ) {
    return object
  }

  const likelyVolume = object.volume
  if (likelyVolume && typeof likelyVolume === "object") {
    const found = findObjectWithVolumeFields(likelyVolume, seen)
    if (found) return found
  }

  for (const child of Object.values(object)) {
    const found = findObjectWithVolumeFields(child, seen)
    if (found) return found
  }
  return null
}

function numberField(object: Record<string, unknown>, key: string): number | null {
  const value = object[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function stringField(object: Record<string, unknown> | null, key: string): string | null {
  if (!object) return null
  const value = object[key]
  return typeof value === "string" && value.trim() ? value : null
}

function arrayField(object: Record<string, unknown>, key: string): unknown[] {
  const value = object[key]
  return Array.isArray(value) ? value : []
}

function summarizeSallyPayload(payload: SallyPayload): SallyPayload {
  const summary: SallyPayload = {}
  for (const key of ["ok", "error", "command_id", "queued", "timed_out", "status"]) {
    if (key in payload) summary[key] = payload[key]
  }
  return Object.keys(summary).length ? summary : { ok: payload.ok ?? false }
}

function loadEnvFiles() {
  const shellEnv = new Set(Object.keys(process.env))

  for (const filePath of [
    join(process.cwd(), ".env"),
    join(process.cwd(), ".env.local"),
    `${process.env.HOME || ""}/.config/heysalad/agent-integrations.env`,
  ]) {
    if (!existsSync(filePath)) continue

    const text = readFileSync(filePath, "utf8")
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue

      const index = trimmed.indexOf("=")
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")
      if (/^[A-Z0-9_]+$/.test(key) && !shellEnv.has(key)) {
        process.env[key] = value
      }
    }
  }
}

// Handle incoming commands from dashboard
async function handleCommand(data: Record<string, unknown>) {
  const { type } = data

  switch (type) {
    case "volume": {
      const value = data.value as number
      deviceState.speaker.volume = value
      deviceState.speaker.muted = false
      previousVolume = value
      await sendToSally({ type: "set_volume", percent: value })
      break
    }

    case "mute": {
      const muted = data.muted as boolean
      deviceState.speaker.muted = muted
      if (muted) {
        previousVolume = deviceState.speaker.volume
        await sendToSally({ type: "set_volume", percent: 0 })
      } else {
        deviceState.speaker.volume = previousVolume
        await sendToSally({ type: "set_volume", percent: previousVolume })
      }
      break
    }

    case "transport": {
      const action = data.action as string
      switch (action) {
        case "play":
          await sendToSally({ type: "spotify_resume" })
          break
        case "pause":
          await sendToSally({ type: "spotify_pause" })
          break
        case "skipForward":
          await sendToSally({ type: "spotify_next" })
          break
        case "skipBack":
          await sendToSally({ type: "spotify_previous" })
          break
      }
      break
    }

    case "spotify_resume":
    case "spotify_pause":
    case "spotify_next":
    case "set_volume":
    case "open_spotify":
    case "recover_playback": {
      const command = { ...data }
      await sendToSally(command)
      if (type === "set_volume") {
        const percent = data.percent as number
        if (Number.isFinite(percent)) {
          deviceState.speaker.volume = clamp(Math.round(percent), 0, 100)
          deviceState.speaker.muted = deviceState.speaker.volume <= 0
        }
      }
      break
    }

    case "encoder": {
      const pad = data.pad as number
      const value = data.value as number
      if (deviceState.macroPads[pad - 1]) {
        deviceState.macroPads[pad - 1].encoder.value = value
      }
      console.log("[Bridge] Encoder update - Pad:", pad, "Value:", value)
      break
    }

    case "macroButton": {
      const pad = data.pad as number
      const button = data.button as number
      const pressed = data.pressed as boolean
      if (deviceState.macroPads[pad - 1]?.buttons[button]) {
        deviceState.macroPads[pad - 1].buttons[button].pressed = pressed
      }
      console.log("[Bridge] Macro button - Pad:", pad, "Button:", button, "Pressed:", pressed)
      break
    }

    case "ptz": {
      const action = data.action as string
      const camera = deviceState.cameras.ptz
      switch (action) {
        case "up":
          camera.tilt = Math.min(90, camera.tilt + 5)
          break
        case "down":
          camera.tilt = Math.max(-90, camera.tilt - 5)
          break
        case "left":
          camera.pan = Math.max(-180, camera.pan - 5)
          break
        case "right":
          camera.pan = Math.min(180, camera.pan + 5)
          break
        case "zoomIn":
          camera.zoom = Math.min(10, camera.zoom + 0.5)
          break
        case "zoomOut":
          camera.zoom = Math.max(1, camera.zoom - 0.5)
          break
      }
      console.log("[Bridge] PTZ control:", action, "Pan:", camera.pan, "Tilt:", camera.tilt, "Zoom:", camera.zoom)
      break
    }

    case "effect": {
      const name = data.name as string
      console.log("[Bridge] Effect triggered:", name)
      break
    }

    default:
      console.log("[Bridge] Unknown command type:", type, data)
  }

  // Broadcast updated state to all clients
  broadcastState()
}

// Create WebSocket server
startHidReaders()
void refreshSallyStatus()
if (SALLY_STATUS_POLL_MS > 0) {
  const sallyStatusTimer = setInterval(() => {
    void refreshSallyStatus()
  }, SALLY_STATUS_POLL_MS)
  sallyStatusTimer.unref()
}

const wss = new WebSocketServer({ port: DJ_SALLY_WS_PORT })

console.log(`[Bridge] WebSocket server starting on port ${DJ_SALLY_WS_PORT}`)
console.log(`[Bridge] Sally API URL: ${SALLY_REMOTE_CONTROL_URL}`)
console.log(`[Bridge] Sally Device ID: ${SALLY_DEVICE_ID}`)
console.log(`[Bridge] Sally Admin Token: ${SALLY_ADMIN_TOKEN ? "Set" : "Not set"}`)

wss.on("connection", (ws) => {
  console.log("[Bridge] Client connected")
  clients.add(ws)

  // Mark speaker as connected when client connects
  deviceState.speaker.connected = true
  deviceState.raspberryPi.connected = true

  // Send initial state
  ws.send(
    JSON.stringify({
      type: "state_update",
      payload: deviceState,
    })
  )

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString())
      console.log("[Bridge] Received:", data)
      await handleCommand(data)
    } catch (error) {
      console.error("[Bridge] Failed to parse message:", error)
    }
  })

  ws.on("close", () => {
    console.log("[Bridge] Client disconnected")
    clients.delete(ws)

    if (clients.size === 0) {
      deviceState.speaker.connected = false
    }
  })

  ws.on("error", (error) => {
    console.error("[Bridge] WebSocket error:", error)
  })
})

wss.on("listening", () => {
  console.log(`[Bridge] WebSocket server listening on ws://localhost:${DJ_SALLY_WS_PORT}`)
})

// Export state for API routes
export { deviceState, handleCommand }
