import { decodeMicrobitMotion, type SmisMotion } from './smis-module-session.ts';
export const MICROBIT_MOTION_SERVICE = 'e95d0753-251d-470a-a062-fa1922dfa9a8';
export const MICROBIT_MOTION_DATA = 'e95dca4b-251d-470a-a062-fa1922dfa9a8';
type Characteristic = EventTarget & { value?: DataView; startNotifications(): Promise<unknown>; stopNotifications(): Promise<unknown> };
type Device = EventTarget & { id: string; gatt?: { connected: boolean; connect(): Promise<{ getPrimaryService(id: string): Promise<{ getCharacteristic(id: string): Promise<Characteristic> }> }>; disconnect(): void } };
export type SmisBluetooth = { requestDevice(options: { filters: ({ namePrefix: string } | { services: string[] })[]; optionalServices: string[] }): Promise<Device> };
const owners = new Map<string, symbol>();
/** Fixed, read-only micro:bit accelerometer service. No firmware, actuator or arbitrary UUID writes. */
export async function connectSmisMicrobit(bluetooth: SmisBluetooth, options: { signal: AbortSignal; connected: (id: string) => void; motion: (value: SmisMotion) => void; disconnected: () => void }) {
  let device: Device | undefined, characteristic: Characteristic | undefined, active = true, timer: ReturnType<typeof setTimeout> | undefined;
  const token = Symbol();
  let cancelSetup: ((error: Error) => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => { cancelSetup = reject; });
  // A synchronous chooser failure can precede Promise.race registration.
  void cancelled.catch(() => {});
  const onValue = () => {
    if (!active || options.signal.aborted || !characteristic?.value) return;
    try { options.motion(decodeMicrobitMotion(characteristic.value)); } catch { stop(); }
  };
  const onLost = () => stop();
  function stop() {
    if (!active) return; active = false; clearTimeout(timer);
    characteristic?.removeEventListener('characteristicvaluechanged', onValue);
    device?.removeEventListener('gattserverdisconnected', onLost);
    options.signal.removeEventListener('abort', stop);
    if (device && owners.get(device.id) === token) {
      owners.delete(device.id);
      // Disconnect is the bounded release. Do not wait for a remote notification acknowledgement.
      try { device.gatt?.disconnect(); } catch { /* Local input is already retired. */ }
    }
    cancelSetup?.(Error('部品の接続を中止しました。'));
    options.disconnected();
  }
  const check = () => { if (!active || options.signal.aborted) throw Error('部品の接続を中止しました。'); };
  options.signal.addEventListener('abort', stop, { once: true });
  try {
    check();
    device = await Promise.race([bluetooth.requestDevice({ filters: [{ namePrefix: 'BBC micro:bit' }, { services: [MICROBIT_MOTION_SERVICE] }], optionalServices: [MICROBIT_MOTION_SERVICE] }), cancelled]);
    check();
    if (!device.gatt) throw Error('この部品へBluetoothで接続できません。');
    owners.set(device.id, token);
    device.addEventListener('gattserverdisconnected', onLost);
    // The chooser is controlled by the user; time out only the GATT connection/setup.
    const setup = (async () => {
      const server = await device!.gatt!.connect();
      if (!active || options.signal.aborted) { if (!owners.has(device!.id) || owners.get(device!.id) === token) device!.gatt!.disconnect(); check(); }
      const service = await server.getPrimaryService(MICROBIT_MOTION_SERVICE); check();
      characteristic = await service.getCharacteristic(MICROBIT_MOTION_DATA); check();
      options.connected(device!.id);
      characteristic.addEventListener('characteristicvaluechanged', onValue);
      await characteristic.startNotifications(); check();
    })();
    await Promise.race([setup, cancelled, new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(Error('部品からの応答を確認できません。電源と準備用プログラムを確認してください。')); stop(); }, 12_000); })]);
    clearTimeout(timer); check(); return { stop };
  } catch (error) {
    stop();
    if (error instanceof Error && /[ぁ-んァ-ヶ一-龠]/u.test(error.message)) throw error;
    throw Error('部品に接続できません。選択を取り消した場合はそのまま終了できます。使用する場合は電源・Bluetoothの許可・動きを送るプログラムを確認してください。');
  }
}
