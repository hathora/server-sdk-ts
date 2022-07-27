# Hathora Typescript Server SDK

## Usage

```ts
register(config);
```

Registers backend with the Hathora Coordinator.

## Register Config

```ts
export type RegisterConfig = {
  coordinatorHost?: string;
  appSecret: string;
  storeId?: string;
  authInfo: AuthInfo;
  store: Store;
};
```

### coordinatorHost

The url of the coordinator instance to connect to

Defaults to coordinator.hathora.dev

### appSecret

A secret string value to securely identify the backend

### storeId

A string to identify the backend instance

Defaults to a random uuid

### authInfo

Configures the authentication providers for the application

```ts
type AuthInfo = {
  anonymous?: { separator: string };
  nickname?: {};
  google?: { clientId: string };
  email?: { secretApiKey: string };
};
```

### store

A class or object conforming to the `Store` interface

```ts
interface Store {
  newState(stateId: StateId, userId: UserId, data: ArrayBufferView): void;
  subscribeUser(stateId: StateId, userId: UserId): void;
  unsubscribeUser(stateId: StateId, userId: UserId): void;
  unsubscribeAll(): void;
  onMessage(stateId: StateId, userId: UserId, data: ArrayBufferView): void;
}
```
