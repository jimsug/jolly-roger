import React from 'react';
import { ReactMeteorData } from 'meteor/react-meteor-data';
import { Flags } from '/imports/flags.js';
import { JRPropTypes } from '/imports/client/JRPropTypes.js';
import { Celebration } from '/imports/client/components/Celebration.jsx';

const CelebrationCenter = React.createClass({
  propTypes: {
    huntId: React.PropTypes.string.isRequired,
  },

  contextTypes: {
    subs: JRPropTypes.subs,
  },

  mixins: [ReactMeteorData],

  getInitialState() {
    return {
      playbackQueue: [],
    };
  },

  componentWillUnmount() {
    if (this.watchHandle) {
      this.watchHandle.stop();
      this.watchHandle = undefined;
    }
  },

  onPuzzleSolved(puzzle) {
    // Only celebrate if:
    // 1) we're not on mobile, and
    // 2) the feature flag is not disabled, and
    // 3) TODO: the user has not disabled it in their profile settings
    if ((window.orientation === undefined) && !this.data.disabled) {
      const newQueue = this.state.playbackQueue.concat([{
        puzzleId: puzzle._id,
        url: `/hunts/${puzzle.hunt}/puzzles/${puzzle._id}`,
        answer: puzzle.answer,
        title: puzzle.title,
      }]);

      this.setState({
        playbackQueue: newQueue,
      });
    }
  },

  getMeteorData() {
    // This should be effectively a noop, since we're already fetching it for every hunt
    const puzzlesHandle = this.context.subs.subscribe('mongo.puzzles', { hunt: this.props.huntId });
    if (puzzlesHandle.ready()) {
      if (this.watchHandle) {
        this.watchHandle.stop();
      }

      this.watchHandle = Models.Puzzles.find().observe({
        changed: (newDoc, oldDoc) => {
          if ((!oldDoc.answer) && newDoc.answer) {
            this.onPuzzleSolved(newDoc);
          }
        },
      });
    }

    return {
      disabled: Flags.active('disable.applause'),
    };
  },

  dismissCurrentCelebration() {
    const [car, ...cons] = this.state.playbackQueue; // eslint-disable-line no-unused-vars
    this.setState({
      playbackQueue: cons,
    });
  },

  render() {
    if (this.state.playbackQueue.length === 0) {
      return null;
    } else {
      const celebration = this.state.playbackQueue[0];
      return (
        <Celebration
          key={celebration.puzzleId}
          url={celebration.url}
          title={celebration.title}
          answer={celebration.answer}
          onClose={this.dismissCurrentCelebration}
        />
      );
    }
  },
});

export { CelebrationCenter };