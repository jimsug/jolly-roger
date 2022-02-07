import TransportStateSchema, { TransportStateType } from '../../schemas/mediasoup/TransportState';
import Base from '../Base';

const TransportStates = new Base<TransportStateType>('mediasoup_transport_states');
TransportStates.attachSchema(TransportStateSchema);

export default TransportStates;