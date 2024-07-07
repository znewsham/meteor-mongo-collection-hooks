import {
  SubscriptionManager
} from "observe-mongo/legacy/redis";

let subManager: SubscriptionManager | undefined;


export function getSubManager() {
  return subManager;
}

export function setSubManager(newSubManager: SubscriptionManager) {
  subManager = newSubManager;
}
