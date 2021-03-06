import AbstractGeneratorDataSource from "./abstract-generator-datasource.mjs";
import GeneratorSettings from "./generator-settings.mjs";

/**
 * Provides a means of storing `GeneratorSettings` on user flags. 
 */
export default class UserFlagGeneratorSettingsDataSource extends AbstractGeneratorDataSource {
  static FLAG_SCOPE = "core";
  static KEY_FLAG = "word-generator-settings";

  /** @override */
  get(userId, id) {
    const user = game.users.get(userId);
    
    if (user === undefined) return undefined;

    const arr = user.getFlag(
      UserFlagGeneratorSettingsDataSource.FLAG_SCOPE,
      UserFlagGeneratorSettingsDataSource.KEY_FLAG
    ) ?? [];

    return GeneratorSettings.fromObject(arr.find(it => it.id === id));
  }
  
  /** @override */
  getAll(userId) {
    const user = game.users.get(userId);
    
    if (user === undefined) return undefined;

    return (user.getFlag(
      UserFlagGeneratorSettingsDataSource.FLAG_SCOPE,
      UserFlagGeneratorSettingsDataSource.KEY_FLAG
    ) ?? []).map(it => GeneratorSettings.fromObject(it));
  }
  
  /** @override */
  set(userId, generatorSetting) {
    const user = game.users.get(userId);

    if (user === undefined) return;

    const arr = user.getFlag(
      UserFlagGeneratorSettingsDataSource.FLAG_SCOPE,
      UserFlagGeneratorSettingsDataSource.KEY_FLAG
    ) ?? [];

    const objectifiedSettings = generatorSetting.toObject();
    const index = arr.findIndex(it => it.id === generatorSetting.id);
    if (index >= 0) {
      arr.splice(index, 1, objectifiedSettings);
    } else {
      arr.push(objectifiedSettings);
    }

    user.setFlag(
      UserFlagGeneratorSettingsDataSource.FLAG_SCOPE,
      UserFlagGeneratorSettingsDataSource.KEY_FLAG,
      arr
    );
  }

    /** @override */
    setAll(userId, generatorSettings) {
      const user = game.users.get(userId);

      if (user === undefined) return;

      user.setFlag(
        UserFlagGeneratorSettingsDataSource.FLAG_SCOPE,
        UserFlagGeneratorSettingsDataSource.KEY_FLAG,
        generatorSettings ?? []
      );
    }
  
  /** @override */
  remove(userId, id) {
    const user = game.users.get(userId);
    
    if (user === undefined) return undefined;

    const arr = user.getFlag(
      UserFlagGeneratorSettingsDataSource.FLAG_SCOPE,
      UserFlagGeneratorSettingsDataSource.KEY_FLAG
    ) ?? [];

    const index = arr.findIndex(it => it.id === id);
    if (index >= 0) {
      arr.splice(index, 1);
    }

    user.setFlag(
      UserFlagGeneratorSettingsDataSource.FLAG_SCOPE,
      UserFlagGeneratorSettingsDataSource.KEY_FLAG,
      arr
    );
  }
  
  /** @override */
  clear(userId) {
    const user = game.users.get(userId);
    
    if (user === undefined) return undefined;

    user.setFlag(
      UserFlagGeneratorSettingsDataSource.FLAG_SCOPE,
      UserFlagGeneratorSettingsDataSource.KEY_FLAG,
      []
    );
  }
}