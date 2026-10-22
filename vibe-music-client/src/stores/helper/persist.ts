import { PersistenceOptions } from "pinia-plugin-persistedstate";

/**
 * @description pinia 持久化参数配置
 * @param {String} key 存储到持久化的 name
 * @return persist
 * */
const piniaPersistConfig = (key: string, storage: Storage = localStorage) => {
    const persist: PersistenceOptions = {
        key,
        storage,
    };
    return persist;
};

export default piniaPersistConfig;
