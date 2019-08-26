import { _ } from 'meteor/underscore';
import { huntsMatchingCurrentUser } from '../../model-helpers';
import Base from './base';
import PuzzlesSchema, { PuzzleType } from '../schemas/puzzles';
import ActiveOperatorRole from '../active-operator-role';

const Puzzles = new Base<PuzzleType>('puzzles', {
  transform(doc: PuzzleType): PuzzleType {
    return _.extend({}, doc, { tags: _.uniq(doc.tags) });
  },
});
Puzzles.attachSchema(PuzzlesSchema);
Puzzles.publish(huntsMatchingCurrentUser);

ActiveOperatorRole.allow('mongo.puzzles.insert', () => true);
ActiveOperatorRole.allow('mongo.puzzles.update', () => true);

export default Puzzles;