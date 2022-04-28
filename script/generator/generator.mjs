import { isInteger } from '../util/validation.mjs';
import RandomSeeded from '../util/random-seed.mjs';
import Sequence from './sequencing/sequence.mjs';

/**
 * This is the algorithm's main logic piece. 
 * 
 * Creating an instance of this type will immediately generate results, based on the given parameters and 
 * then make them available them via the `results` getter. 
 * @property {Array<String>} results
 * @property {Array<String>} sampleSet
 * @property {Number} depth
 * @property {Number} targetLengthMin
 * @property {Number} targetLengthMax
 * @property {AbstractSequencingStrategy} sequencingStrategy
 * @property {AbstractSpellingStrategy | undefined} spellingStrategy
 */
export default class MarkovChainWordGenerator {
  /**
   * @private
   */
  _results = [];
  /**
   * Returns a list of results, based on the given sample set and parameters. 
   * @type {Array<String>}
   * @readonly
   */
  get results() { return this._results; }
  
  /**
   * @private
   */
  _sampleSet = undefined;
  /**
   * Returns the provided sample set. 
   * @type {Array<String>}
   * @readonly
   */
  get sampleSet() { return this._sampleSet; }
  
  /**
   * @private
   */
  _targetLengthMin = undefined;
  /**
   * Returns the provided target minimum length. 
   * @type {Number}
   * @readonly
   */
  get targetLengthMin() { return this._targetLengthMin; }
  
  /**
   * @private
   */
  _targetLengthMax = undefined;
  /**
   * Returns the provided target maximum length. 
   * @type {Number}
   * @readonly
   */
  get targetLengthMax() { return this._targetLengthMax; }

  /**
   * The sequencing strategy used to determine sequences. 
   * @type {AbstractSequencingStrategy}
   */
  sequencingStrategy = undefined;

  /**
   * The spelling strategy applied to generated words. 
   * 
   * If undefined, to spelling will be applied. 
   * @type {AbstractSpellingStrategy | undefined}
   */
  spellingStrategy = undefined;

  /**
   * @type {String}
   * @private
   */
  _seed = undefined;
  /**
   * Returns seed used in randomization. 
   * @type {String}
   * @readonly
   */
  get seed() { return this._seed; }

  /**
   * The seeded random number generator. 
   * @type {RandomSeeded}
   * @private
   */
  _rng = undefined;

  /**
   * @param {Object} args Parameter object. 
   * @param {Array<String>} args.sampleSet The sample set this generator will work with. 
   * @param {Number} args.targetLengthMin The minimum length the results *should* have. 
   * @param {Number} args.targetLengthMax The maximum length the results *should* have. 
   * @param {AbstractSequencingStrategy} args.sequencingStrategy The sequencing strategy to use. 
   * @param {String | undefined} args.seed Optional. A seed for the randomization. 
   * @param {AbstractSpellingStrategy | undefined} args.spellingStrategy Optional. The spelling strategy applied to generated words. 
   * 
   * @throws {Error} Thrown, if the sample set is an empty list or undefined. 
   * @throws {Error} Thrown, if the depth is less than 1 or undefined or no integer value. 
   * @throws {Error} Thrown, if any of the target lengths are less than 1, undefined or no integer value. 
   */
  constructor(args = {}) {
    if (args.sampleSet === undefined || args.sampleSet.length === 0) {
      throw new Error("`args.sampleSet` must not be undefined or an empty list!");
    }
    if (isInteger(args.targetLengthMin) !== true || parseInt(args.targetLengthMin) <= 0) {
      throw new Error("`args.targetLengthMin` must be an integer, greater or equal to 1!");
    }
    if (isInteger(args.targetLengthMax) !== true || parseInt(args.targetLengthMax) <= 0) {
      throw new Error("`args.targetLengthMax` must be an integer, greater or equal to 1!");
    }
    if (args.sequencingStrategy === undefined) {
      throw new Error("`args.sequencingStrategy` must be not be undefined!");
    }
    
    this._sampleSet = args.sampleSet;
    this._depth = args.depth;
    this._targetLengthMin = args.targetLengthMin;
    this._targetLengthMax = args.targetLengthMax;
    this._seed = args.seed;
    this.sequencingStrategy = args.sequencingStrategy;
    this.spellingStrategy = args.spellingStrategy;

    this._rng = new RandomSeeded(this._seed);
  }

  /**
   * Returns the given number of words, randomly generated, based on the parameters of the generator. 
   * @returns {Array<String>} A list of generated words.
   * @throws {Error} Thrown, if generating a unique word takes too many tries. Possibly because 
   * the target length was unreachable. 
   */
  generate(howMany) {
    const sequences = this.sequencingStrategy.getSequencesOfSet(this.sampleSet);
    const aggregatedSequences = this._aggregateSequences(sequences);

    const probabilities = this._getAggregatedSequenceProbabilities(aggregatedSequences);
    const probableBeginnings = this._getWeightedProbabilities(probabilities, SEQUENCE_TYPES.BEGINNING);
    const probableMiddles = this._getWeightedProbabilities(probabilities, SEQUENCE_TYPES.MIDDLE);
    const probableEndings = this._getWeightedProbabilities(probabilities, SEQUENCE_TYPES.ENDING);

    // Generate words. 
    const repetitionMaximum = 1000;
    const words = [];
    for (let i = 0; i < howMany; i++) {
      let word = undefined;

      let attempt = 0;
      do {
        if (attempt >= repetitionMaximum) {
          throw new Error("Maximum number of tries to produce unique word exceeded!");
        }

        try {
          word = this._generateSingleWord(probableBeginnings, probableMiddles, probableEndings, this._targetLengthMin, this._targetLengthMax);
        } catch (error) {
          // Prevent crash and re-throw, if necessary. 
          if (attempt + 1 >= repetitionMaximum) {
            throw new Error("Maximum number of tries to produce unique word exceeded! Inner cause: " + error);
          }
        }
        
        attempt++;
      } while (word === undefined || words.find(it => { return it === word; }) !== undefined);
      
      words.push(word);
    }
    
    // Apply spelling strategy, if one is defined. 
    if (this.spellingStrategy !== undefined) {
      return words.map(it => { return this.spellingStrategy.apply(it); });
    } else {
      return words;
    }
  }

  /**
   * 
   * @param {Array<AggregatedSequence>} aggregatedSequences 
   * @returns {Array<AggregatedSequenceProbabilities>}
   * @private
   */
  _getAggregatedSequenceProbabilities(aggregatedSequences) {
    // Tally up the total numbers of occurences, by beginning, middle and ending. 

    let frequencyTotalBeginnings = 0;
    let frequencyTotalMiddles = 0;
    let frequencyTotalEndings = 0;
    let frequencyTotal = aggregatedSequences.length;

    for (const aggregatedSequence of aggregatedSequences) {
      frequencyTotalBeginnings += aggregatedSequence.frequencyBeginning;
      frequencyTotalMiddles += aggregatedSequence.frequencyMiddle;
      frequencyTotalEndings += aggregatedSequence.frequencyEnding;
    }

    // Calculate the probabilities. 
    const probabilities = [];

    for (const aggregatedSequence of aggregatedSequences) {
      const totalOccurrences = aggregatedSequence.frequencyBeginning + aggregatedSequence.frequencyMiddle + aggregatedSequence.frequencyEnding;
      probabilities.push(new AggregatedSequenceProbabilities({
        sequence: aggregatedSequence,
        probabilityBeginning: aggregatedSequence.frequencyBeginning > 0 ? aggregatedSequence.frequencyBeginning / frequencyTotalBeginnings : 0,
        probabilityMiddle: aggregatedSequence.frequencyMiddle > 0 ? aggregatedSequence.frequencyMiddle / frequencyTotalMiddles : 0,
        probabilityEnding: aggregatedSequence.frequencyEnding > 0 ? aggregatedSequence.frequencyEnding / frequencyTotalEndings : 0,
        probability: totalOccurrences / frequencyTotal,
      }));
    }

    return probabilities;
  }

  /**
   * Returns a list of aggregated sequences, based on the given sequences. 
   * @param {Array<Sequence>} sequences 
   * @returns {Array<AggregatedSequence>}
   * @private
   */
  _aggregateSequences(sequences) {
    // Map<String, AggregatedSequence>
    // The key is the chars string of the sequence. 
    const mapOfAggregated = new Map();

    for (const sequence of sequences) {
      // Get or create the respective instance of an aggregated sequence. 
      let aggregratedSequence = mapOfAggregated.get(sequence.chars);
      if (aggregratedSequence === undefined) {
        aggregratedSequence = new AggregatedSequence({
          chars: sequence.chars,
          frequencyBeginning: 0,
          frequencyMiddle: 0,
          frequencyEnding: 0,
          frequency: 0,
        });
        mapOfAggregated.set(sequence.chars, aggregratedSequence);
      }

      // Modify the aggregated sequence's values. 
      if (sequence.isBeginning === true) {
        aggregratedSequence.frequencyBeginning++;
      }
      if (sequence.isMiddle === true) {
        aggregratedSequence.frequencyMiddle++;
      }
      if (sequence.isEnding === true) {
        aggregratedSequence.frequencyEnding++;
      }
      aggregratedSequence.frequency++;
    }
    
    const aggregated = [];
    for (const value of mapOfAggregated.values()) {
      aggregated.push(value);
    }
    return aggregated;
  }

  /**
   * Returns a sorted and weighted list of sequences. 
   * 
   * Each result returned consists of a 'sequence' and a 'probability' property. 
   * 
   * The probabilities appear in order. E. g.
   * ```
   * Sequence:    |  a  |  b  |  c  |  d  |
   *              | --- | --- | --- | --- |
   * Frequency:   |  3  |  2  |  2  |  1  | total: 8
   * Probability: |0.375|0.625|0.875|1.000| 
   * ```
   * 
   * The random number, which is then generated, must be a value between 0 and 1 (inclusive). 
   * These values should then be iterated and the first value which is greater or equal to the 
   * random number, is the choice to pick. 
   * 
   * @param {Array<AggregatedSequenceProbabilities>} probabilities 
   * @param {SEQUENCE_TYPES} type 
   * @returns {Array<ProbabilityAndSequence>}
   * @private
   */
  _getWeightedProbabilities(probabilities, type) {
    let filteredAndSorted = [];

    // Filter by type. 
    if (type === SEQUENCE_TYPES.BEGINNING) {
      filteredAndSorted = probabilities.filter(it => { return it.probabilityBeginning > 0; })
      .map(it => { 
        return new ProbabilityAndSequence({
          sequence: it.sequence,
          probability: it.probabilityBeginning,
        });
      });
    } else if (type === SEQUENCE_TYPES.MIDDLE) {
      filteredAndSorted = probabilities.filter(it => { return it.probabilityMiddle > 0; })
      .map(it => { 
        return new ProbabilityAndSequence({
          sequence: it.sequence,
          probability: it.probabilityMiddle,
        });
      });
    } else if (type === SEQUENCE_TYPES.ENDING) {
      filteredAndSorted = probabilities.filter(it => { return it.probabilityEnding > 0; })
      .map(it => { 
        return new ProbabilityAndSequence({
          sequence: it.sequence,
          probability: it.probabilityEnding,
        });
      });
    }

    // Sort by absolute probability. 
    filteredAndSorted.sort((a, b) => { a.probability > b.probability ? 1 : -1 });

    // Enrich with weights. 
    const weightedAndSorted = [];
    let newProbability = 0;
    for (const o of filteredAndSorted) {
      newProbability = newProbability + o.probability;
      weightedAndSorted.push({
        probability: newProbability,
        sequence: o.sequence,
      });
    }

    // This pre-empts any floating-point inaccuracies. 
    weightedAndSorted[weightedAndSorted.length - 1].probability = 1.0;

    return weightedAndSorted;
  }

  /**
   * Generates a single word, based on the given probabilty-weighted sequences. 
   * 
   * Also tries to ensure the generated word stays within the given min and max length. 
   * @param {Array<ProbabilityAndSequence>} probableBeginnings 
   * @param {Array<ProbabilityAndSequence>} probableMiddles 
   * @param {Array<ProbabilityAndSequence>} probableEndings 
   * @param {Number} minLength Targeted minimum length in string characters. 
   * @param {Number} maxLength Targeted maximum length in string characters. 
   * @returns {String} The generated word. 
   * @private
   * @throws {Error} Thrown, if the target length could not be achieved. 
   */
  _generateSingleWord(probableBeginnings, probableMiddles, probableEndings, minLength, maxLength) {
    const resultingSequences = [];

    function _getMatchingSequence(weightedList, value) {
      for (const weightedItem of weightedList) {
        if (value <= weightedItem.probability) {
          return weightedItem;
        }
      }
      throw new Error(`Failed to get item for value '${value}' from list!`);
    }

    const targetLength = Math.round(this._rng.generate(minLength, maxLength));

    // This is the length of the string that will be produced. 
    let charactersLength = 0;

    // Determine first sequence.
    const rndBeginning = this._rng.generate();
    const beginningSequence = _getMatchingSequence(probableBeginnings, rndBeginning).sequence;
    resultingSequences.push(beginningSequence);
    charactersLength += beginningSequence.chars.length;
    
    // Determine last sequence. 
    const rndEnding = this._rng.generate();
    const endingSequence = _getMatchingSequence(probableEndings, rndEnding).sequence;
    charactersLength += endingSequence.chars.length;
    
    // Determine middle sequences. 
    while (charactersLength < targetLength) {
      const rndMiddle = this._rng.generate();
      const middleSequence = _getMatchingSequence(probableMiddles, rndMiddle).sequence;
      resultingSequences.push(middleSequence);
      charactersLength += middleSequence.chars.length;
    }

    // Add ending sequence, so that it will be last in the list. 
    resultingSequences.push(endingSequence);
    
    return resultingSequences.map(it => it.chars).join("");
  }
}

/**
 * Represents an aggregated sequence. 
 * @property {String} chars  The chars of the sequence. 
 * @property {Number} args.frequencyBeginning How often the char sequence occurred at the beginning of a sample.
 * @property {Number} args.frequencyMiddle How often the char sequence occurred in the middle of a sample.
 * @property {Number} args.frequencyEnding How often the char sequence occurred at the end of a sample.
 * @property {Number} args.frequency How often the char sequence occurred in total. 
 */
class AggregatedSequence {
  constructor(args = {}) {
    this.chars = args.chars;
    this.frequencyBeginning = args.frequencyBeginning;
    this.frequencyMiddle = args.frequencyMiddle;
    this.frequencyEnding = args.frequencyEnding;
    this.frequency = args.frequency;
  }
}

/**
 * Represents the probabilities of an aggregated sequence. 
 * @property {AggregatedSequence} sequence
 * @property {Number} args.probabilityBeginning How probable the sequence is to be a beginning. 
 * @property {Number} args.probabilityMiddle How probable the sequence is to be a middle. 
 * @property {Number} args.probabilityEnding How probable the sequence is to be an ending. 
 * @property {Number} args.probability How probable the sequence is. 
 */
class AggregatedSequenceProbabilities {
  constructor(args = {}) {
    this.sequence = args.sequence;
    this.probabilityBeginning = args.probabilityBeginning;
    this.probabilityMiddle = args.probabilityMiddle;
    this.probabilityEnding = args.probabilityEnding;
    this.probability = args.probability;
  }
}

/**
 * @property {Number} probability
 * @property {AggregatedSequence} sequence
 */
class ProbabilityAndSequence {
  constructor(args = {}) {
    this.probability = args.probability;
    this.sequence = args.sequence;
  }
}

const SEQUENCE_TYPES = {
  BEGINNING: 0,
  MIDDLE: 1,
  ENDING: 2
}