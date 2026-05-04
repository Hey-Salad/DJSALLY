import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { basename, join } from "node:path"

const USB_DEVICES_PATH = "/sys/bus/usb/devices"
const HIDRAW_PATH = "/sys/class/hidraw"
const INPUT_BY_PATH = "/dev/input/by-path"

export interface HidDeckMapping {
  pad: number
  label: string
  usbDevice: string
  vendorId: string
  productId: string
  keyboardPaths: string[]
  encoderPath: string
  rawPaths: string[]
}

export interface HidDeckMappingResult {
  decks: HidDeckMapping[]
  source: "sysfs" | "fallback"
  reason?: string
}

interface ResolveHidDecksOptions {
  vendorId?: string
  productId?: string
  deckAUsbDevice?: string
  deckBUsbDevice?: string
}

interface UsbHidCandidate {
  usbDevice: string
  vendorId: string
  productId: string
  port: string
  sortKey: string
}

interface HidRawDevice {
  path: string
  phys: string
}

export function resolveDjSallyHidDecks(options: ResolveHidDecksOptions = {}): HidDeckMappingResult {
  const vendorId = normalizeUsbId(options.vendorId ?? "1189")
  const productId = normalizeUsbId(options.productId ?? "8890")
  const candidates = findUsbHidCandidates(vendorId, productId)

  if (candidates.length < 2) {
    return {
      decks: [],
      source: "fallback",
      reason: `expected at least two ${vendorId}:${productId} HID devices, found ${candidates.length}`,
    }
  }

  const selected = selectDeckCandidates(candidates, options)
  if (!selected) {
    return {
      decks: [],
      source: "fallback",
      reason: "could not select two distinct HID deck devices",
    }
  }

  const rawDevices = findHidRawDevices(vendorId, productId)
  return {
    source: "sysfs",
    decks: [
      buildDeckMapping(1, "Deck A", selected[0], rawDevices),
      buildDeckMapping(2, "Deck B", selected[1], rawDevices),
    ],
  }
}

function findUsbHidCandidates(vendorId: string, productId: string): UsbHidCandidate[] {
  if (!existsSync(USB_DEVICES_PATH)) return []

  return readdirSync(USB_DEVICES_PATH)
    .filter((entry) => /^\d+-\d+(?:\.\d+)*$/.test(entry))
    .map((usbDevice) => {
      const devicePath = join(USB_DEVICES_PATH, usbDevice)
      const idVendor = readSysfsValue(join(devicePath, "idVendor"))
      const idProduct = readSysfsValue(join(devicePath, "idProduct"))
      const speed = readSysfsValue(join(devicePath, "speed"))
      if (normalizeUsbId(idVendor) !== vendorId || normalizeUsbId(idProduct) !== productId || speed !== "12") {
        return null
      }

      const interfaces = readdirSync(USB_DEVICES_PATH).filter((entry) => entry.startsWith(`${usbDevice}:`))
      const hidInterfaces = interfaces.filter((entry) => readSysfsValue(join(USB_DEVICES_PATH, entry, "bInterfaceClass")) === "03")
      if (hidInterfaces.length < 3) return null

      return {
        usbDevice,
        vendorId,
        productId,
        port: lastUsbPort(usbDevice),
        sortKey: usbDevice,
      }
    })
    .filter((candidate): candidate is UsbHidCandidate => Boolean(candidate))
    .sort((a, b) => compareUsbDevicePath(a.sortKey, b.sortKey))
}

function selectDeckCandidates(
  candidates: UsbHidCandidate[],
  options: ResolveHidDecksOptions
): [UsbHidCandidate, UsbHidCandidate] | null {
  const byDevice = new Map(candidates.map((candidate) => [candidate.usbDevice, candidate]))
  if (options.deckAUsbDevice || options.deckBUsbDevice) {
    const deckA = options.deckAUsbDevice ? byDevice.get(options.deckAUsbDevice) : candidates[0]
    const deckB = options.deckBUsbDevice ? byDevice.get(options.deckBUsbDevice) : candidates.find((candidate) => candidate.usbDevice !== deckA?.usbDevice)
    if (!deckA || !deckB || deckA.usbDevice === deckB.usbDevice) return null
    return [deckA, deckB]
  }

  return [candidates[0], candidates[1]]
}

function buildDeckMapping(
  pad: number,
  label: string,
  candidate: UsbHidCandidate,
  rawDevices: HidRawDevice[]
): HidDeckMapping {
  const rawPaths = rawDevices
    .filter((device) => device.phys.includes(`-${candidate.port}/input`))
    .sort((a, b) => compareInputPhys(a.phys, b.phys))
    .map((device) => device.path)

  return {
    pad,
    label,
    usbDevice: candidate.usbDevice,
    vendorId: candidate.vendorId,
    productId: candidate.productId,
    keyboardPaths: [
      inputByPath(candidate.port, "1.0-event-kbd"),
      inputByPath(candidate.port, "1.2-event-kbd"),
    ].filter(existsSync),
    encoderPath: inputByPath(candidate.port, "1.3-event-mouse"),
    rawPaths,
  }
}

function findHidRawDevices(vendorId: string, productId: string): HidRawDevice[] {
  if (!existsSync(HIDRAW_PATH)) return []

  return readdirSync(HIDRAW_PATH)
    .filter((entry) => entry.startsWith("hidraw"))
    .map((entry) => {
      const hidrawPath = join(HIDRAW_PATH, entry)
      let ueventPath: string
      try {
        ueventPath = join(realpathSync(join(hidrawPath, "device")), "uevent")
      } catch {
        return null
      }
      const uevent = parseUevent(ueventPath)
      const id = uevent.get("HID_ID") ?? ""
      const hidSuffix = `:${vendorId.toUpperCase().padStart(8, "0")}:${productId.toUpperCase().padStart(8, "0")}`
      if (!id.toUpperCase().endsWith(hidSuffix)) {
        return null
      }
      return {
        path: `/dev/${basename(hidrawPath)}`,
        phys: uevent.get("HID_PHYS") ?? "",
      }
    })
    .filter((device): device is HidRawDevice => Boolean(device))
}

function inputByPath(port: string, suffix: string) {
  if (!existsSync(INPUT_BY_PATH)) return ""
  const match = readdirSync(INPUT_BY_PATH).find((entry) => entry.includes(`usb-0:${port}:`) && entry.endsWith(suffix))
  return match ? join(INPUT_BY_PATH, match) : ""
}

function parseUevent(path: string) {
  const result = new Map<string, string>()
  for (const line of readSysfsValue(path).split("\n")) {
    const index = line.indexOf("=")
    if (index > 0) result.set(line.slice(0, index), line.slice(index + 1))
  }
  return result
}

function readSysfsValue(path: string) {
  try {
    return readFileSync(path, "utf8").trim()
  } catch {
    return ""
  }
}

function normalizeUsbId(value: string) {
  return value.trim().toLowerCase().padStart(4, "0")
}

function lastUsbPort(usbDevice: string) {
  const lastSegment = usbDevice.split("-").pop() ?? usbDevice
  return lastSegment.split(".").pop() ?? lastSegment
}

function compareUsbDevicePath(a: string, b: string) {
  const aParts = a.split(/[-.]/).map(Number)
  const bParts = b.split(/[-.]/).map(Number)
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0)
    if (diff !== 0) return diff
  }
  return a.localeCompare(b)
}

function compareInputPhys(a: string, b: string) {
  const inputA = parseInt(a.match(/input(\d+)/)?.[1] ?? "0", 10)
  const inputB = parseInt(b.match(/input(\d+)/)?.[1] ?? "0", 10)
  return inputA - inputB || a.localeCompare(b)
}
