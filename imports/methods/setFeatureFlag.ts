import TypedMethod from './TypedMethod';

type SetFeatureFlagArgs = {
  name: string,
  type: 'on' | 'off' | 'random_by',
  random?: number,
};

export default new TypedMethod<SetFeatureFlagArgs, void>(
  'FeatureFlags.methods.set'
);