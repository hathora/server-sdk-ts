import net from "net";
import { Reader, Writer } from "bin-serde";
import { createHash } from "crypto";

const NEW_STATE = 0;
const SUBSCRIBE_USER = 1;
const UNSUBSCRIBE_USER = 2;
const MESSAGE = 3;

enum STORE_MESSAGES {
  STATE_UPDATE = 0,
  STATE_NOT_FOUND = 1,
  PING = 2,
}

const PING_INTERVAL_MS = 10000;

type StateId = bigint;
type UserId = string;

function readData(socket: net.Socket, onData: (data: Buffer) => void) {
  let buf = Buffer.alloc(0);
  socket.on("data", (data) => {
    buf = Buffer.concat([buf, data]);
    while (buf.length >= 4) {
      const bufLen = buf.readUInt32BE();
      if (buf.length < 4 + bufLen) {
        return;
      }
      onData(buf.subarray(4, 4 + bufLen));
      buf = buf.subarray(4 + bufLen);
    }
  });
}

export type AuthInfo = {
  anonymous?: { separator: string };
  nickname?: {};
  google?: { clientId: string };
  email?: { secretApiKey: string };
};

export function register(
  coordinatorHost: string,
  appSecret: string,
  storeId: string,
  authInfo: AuthInfo,
  store: Store
): Promise<CoordinatorClient> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let pingTimer: NodeJS.Timer;
    socket.connect(7147, coordinatorHost);
    socket.on("connect", () => {
      socket.write(
        JSON.stringify({
          appSecret,
          storeId,
          authInfo,
        })
      );
      const appId = createHash("sha256").update(appSecret).digest("hex");
      console.log(`Connected to coordinator at ${coordinatorHost} with appId ${appId}`);
      const coordinatorClient = new CoordinatorClient(socket);
      pingTimer = setInterval(() => coordinatorClient.ping(), PING_INTERVAL_MS);
      resolve(coordinatorClient);
    });
    socket.on("error", (err) => {
      console.error("Coordinator connection error", err);
      if (pingTimer !== undefined) {
        clearInterval(pingTimer);
      }
      reject(err.message);
    });
    socket.on("close", () => {
      console.error("Coordinator connection closed, retrying...");
      store.unsubscribeAll();
      if (pingTimer !== undefined) {
        clearInterval(pingTimer);
      }
      setTimeout(() => socket.connect(7147, coordinatorHost), 1000 + Math.random() * 1000);
    });
    readData(socket, (data) => {
      const reader = new Reader(data);
      const type = reader.readUInt8();
      if (type === NEW_STATE) {
        store.newState(reader.readUInt64(), reader.readString(), reader.readBuffer(reader.remaining()));
      } else if (type === SUBSCRIBE_USER) {
        store.subscribeUser(reader.readUInt64(), reader.readString());
      } else if (type === UNSUBSCRIBE_USER) {
        store.unsubscribeUser(reader.readUInt64(), reader.readString());
      } else if (type === MESSAGE) {
        store.onMessage(reader.readUInt64(), reader.readString(), reader.readBuffer(reader.remaining()));
      } else {
        throw new Error("Unknown type: " + type);
      }
    });
  });
}

interface Store {
  newState(stateId: StateId, userId: UserId, data: ArrayBufferView): void;
  subscribeUser(stateId: StateId, userId: UserId): void;
  unsubscribeUser(stateId: StateId, userId: UserId): void;
  unsubscribeAll(): void;
  onMessage(stateId: StateId, userId: UserId, data: ArrayBufferView): void;
}

class CoordinatorClient {
  constructor(private socket: net.Socket) {}

  public stateUpdate(stateId: StateId, userId: UserId, data: Buffer) {
    const userIdBuf = new Writer().writeString(userId).toBuffer();
    this.socket.write(
      new Writer()
        .writeUInt32(9 + userIdBuf.length + data.length)
        .writeUInt8(STORE_MESSAGES.STATE_UPDATE)
        .writeUInt64(stateId)
        .writeBuffer(userIdBuf)
        .writeBuffer(data)
        .toBuffer()
    );
  }

  public stateNotFound(stateId: StateId, userId: UserId) {
    const userIdBuf = new Writer().writeString(userId).toBuffer();
    this.socket.write(
      new Writer()
        .writeUInt32(9 + userIdBuf.length)
        .writeUInt8(STORE_MESSAGES.STATE_NOT_FOUND)
        .writeUInt64(stateId)
        .writeBuffer(userIdBuf)
        .toBuffer()
    );
  }

  public ping() {
    this.socket.write(new Writer().writeUInt32(1).writeUInt8(STORE_MESSAGES.PING).toBuffer());
  }
}
