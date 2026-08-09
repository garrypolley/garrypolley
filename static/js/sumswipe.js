/**
 * SumSwipe — daily 5×5 fill-the-board word puzzle.
 * Swipe paths to claim cells with dictionary words (A=1…Z=26). Goal: all 25 cells.
 * Pure helpers exported for smoke tests.
 */
var SumSwipeUtils = (function () {
  "use strict";

  var MIN_WORD_LEN = 3;
  var MAX_WORD_LEN = 8;
  var GRID_SIZE = 5;
  /** Bonus multiplier when all cells are claimed. */
  var FILL_BONUS = 0.15;
  /** How far back day navigation may go from today. */
  var MAX_HISTORY_DAYS = 365;
  /** Target extra words on generated grids (best-effort). */
  var TARGET_WORD_COUNT = 15;
  /** Generator retry budget per day. */
  var GENERATOR_ATTEMPTS = 80;

  var puzzleCache = {};

  function letterValue(ch) {
    if (typeof ch !== "string" || ch.length === 0) {
      return 0;
    }
    var code = ch.toUpperCase().charCodeAt(0);
    if (code < 65 || code > 90) {
      return 0;
    }
    return code - 64;
  }

  function wordSum(word) {
    if (typeof word !== "string") {
      return 0;
    }
    var total = 0;
    for (var i = 0; i < word.length; i++) {
      total += letterValue(word.charAt(i));
    }
    return total;
  }

  /** Length factor: 3→1, 4→1.15, 5→1.35, 6→1.6, 7+→1.9 */
  function lengthFactor(len) {
    var n = parseInt(len, 10);
    if (!n || n < MIN_WORD_LEN) {
      return 0;
    }
    if (n === 3) {
      return 1;
    }
    if (n === 4) {
      return 1.15;
    }
    if (n === 5) {
      return 1.35;
    }
    if (n === 6) {
      return 1.6;
    }
    return 1.9;
  }

  function wordPoints(word) {
    var w = normalizeWord(word);
    if (!w) {
      return 0;
    }
    return Math.round(wordSum(w) * lengthFactor(w.length));
  }

  function scoreWordsWithFill(entries, claimedCount, size) {
    var total = 0;
    if (!Array.isArray(entries)) {
      return 0;
    }
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry) {
        continue;
      }
      if (typeof entry.points === "number") {
        total += entry.points;
      } else if (entry.word) {
        total += wordPoints(entry.word);
      }
    }
    var cells = (size || GRID_SIZE) * (size || GRID_SIZE);
    if (claimedCount >= cells) {
      total = Math.round(total * (1 + FILL_BONUS));
    }
    return total;
  }

  function normalizeWord(word) {
    if (typeof word !== "string") {
      return "";
    }
    return word.toUpperCase().replace(/[^A-Z]/g, "");
  }

  function reverseWord(word) {
    return normalizeWord(word).split("").reverse().join("");
  }

  function indexToRowCol(index, size) {
    return { row: Math.floor(index / size), col: index % size };
  }

  function rowColToIndex(row, col, size) {
    return row * size + col;
  }

  function areAdjacent(a, b, size) {
    var pa = indexToRowCol(a, size);
    var pb = indexToRowCol(b, size);
    var dr = Math.abs(pa.row - pb.row);
    var dc = Math.abs(pa.col - pb.col);
    if (dr === 0 && dc === 0) {
      return false;
    }
    return dr <= 1 && dc <= 1;
  }

  /**
   * How a tap/click on `index` should affect an existing path.
   * start | extend | backtrack | noop | restart
   * Sliding back to the previous tile undoes (backtrack), not reuse.
   * Non-adjacent taps start a new path.
   */
  function pathTapAction(path, index, size) {
    if (!Array.isArray(path) || path.length === 0) {
      return "start";
    }
    var last = path[path.length - 1];
    if (index === last) {
      return "noop";
    }
    if (path.length >= 2 && index === path[path.length - 2]) {
      return "backtrack";
    }
    if (path.indexOf(index) !== -1) {
      return "noop";
    }
    if (areAdjacent(last, index, size)) {
      return "extend";
    }
    return "restart";
  }

  /**
   * Focus index after keyboard Backspace pops the path end.
   * Returns null when the path is empty afterward.
   */
  function focusAfterBackspace(pathAfterPop) {
    if (!Array.isArray(pathAfterPop) || pathAfterPop.length === 0) {
      return null;
    }
    return pathAfterPop[pathAfterPop.length - 1];
  }

  /**
   * Whether a pointer-up should count toward double-tap submit.
   * Path-changing gestures never count. Jitter on the path end still counts.
   */
  function countsTowardDoubleTap(opts) {
    var gestureChangedPath = !!(opts && opts.gestureChangedPath);
    var dragMoved = !!(opts && opts.dragMoved);
    var onPathEnd = !!(opts && opts.onPathEnd);
    if (gestureChangedPath) {
      return false;
    }
    if (dragMoved && !onPathEnd) {
      return false;
    }
    return true;
  }

  /**
   * Detect a double-tap on the same index within the window.
   */
  function isDoubleTap(now, lastTime, lastIndex, index, windowMs) {
    if (index < 0 || lastIndex < 0) {
      return false;
    }
    return now - lastTime <= windowMs && index === lastIndex;
  }

  function isValidPath(indices, size) {
    if (!Array.isArray(indices) || indices.length === 0) {
      return false;
    }
    var seen = {};
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      if (typeof idx !== "number" || idx !== idx || idx < 0 || idx >= size * size) {
        return false;
      }
      if (seen[idx]) {
        return false;
      }
      seen[idx] = true;
      if (i > 0) {
        if (indices[i - 1] === idx) {
          return false;
        }
        if (!areAdjacent(indices[i - 1], idx, size)) {
          return false;
        }
      }
    }
    return true;
  }

  function isCellClaimed(claimed, index) {
    return !!(claimed && claimed[index]);
  }

  function countClaimed(claimed) {
    var n = 0;
    if (!claimed) {
      return 0;
    }
    for (var key in claimed) {
      if (Object.prototype.hasOwnProperty.call(claimed, key) && claimed[key]) {
        n++;
      }
    }
    return n;
  }

  function claimPath(claimed, path) {
    if (!claimed || !Array.isArray(path)) {
      return claimed || {};
    }
    for (var i = 0; i < path.length; i++) {
      claimed[path[i]] = true;
    }
    return claimed;
  }

  function pathUsesClaimed(path, claimed) {
    if (!Array.isArray(path) || !claimed) {
      return false;
    }
    for (var i = 0; i < path.length; i++) {
      if (isCellClaimed(claimed, path[i])) {
        return true;
      }
    }
    return false;
  }

  function rebuildClaimedFromFound(found) {
    var claimed = {};
    if (!Array.isArray(found)) {
      return claimed;
    }
    for (var i = 0; i < found.length; i++) {
      var path = found[i] && found[i].path;
      if (Array.isArray(path)) {
        claimPath(claimed, path);
      }
    }
    return claimed;
  }

  function pathToWord(grid, indices) {
    if (!Array.isArray(grid) || !Array.isArray(indices)) {
      return "";
    }
    var out = "";
    for (var i = 0; i < indices.length; i++) {
      var ch = grid[indices[i]];
      if (typeof ch !== "string") {
        return "";
      }
      out += ch;
    }
    return normalizeWord(out);
  }

  function flattenGrid(rows) {
    var out = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        out.push(String(row.charAt ? row.charAt(c) : row[c]).toUpperCase());
      }
    }
    return out;
  }

  var BASE_WORDS = [
    "ADD","AGE","AIR","AND","ANT","APE","ARC","ARE","ARK","ARM","ART","ASH","ASK",
    "BAG","BAT","BED","BEE","BET","BIG","BIT","BOX","BOY","BUS","BUT","BUY",
    "CAB","CAN","CAP","CAR","CAT","COW","CRY","CUP","CUT",
    "DAD","DAY","DEN","DID","DIE","DIG","DIM","DIP","DOG","DOT","DRY","DUE",
    "EAR","EAT","EEL","EGG","ELF","END","ERA","EVE","EYE",
    "FAN","FAR","FAT","FED","FEW","FIG","FIN","FIR","FIT","FIX","FLY","FOG","FOR","FOX","FUN","FUR",
    "GAP","GAS","GEL","GEM","GET","GIG","GIN","GOD","GOT","GUM","GUN","GUY","GYM",
    "HAD","HAM","HAS","HAT","HAY","HEN","HER","HID","HIM","HIP","HIS","HIT","HOG","HOP","HOT","HOW","HUB","HUE","HUG","HUM","HUT",
    "ICE","ILL","INK","INN","ION","ITS","IVY",
    "JAM","JAR","JAW","JAY","JET","JOB","JOG","JOY","JUG",
    "KEY","KID","KIN","KIT",
    "LAB","LAD","LAG","LAP","LAW","LAY","LED","LEG","LET","LID","LIE","LIP","LIT","LOG","LOT","LOW",
    "MAD","MAN","MAP","MAT","MAY","MEN","MET","MIX","MOB","MOM","MOP","MUD","MUG",
    "NAG","NAP","NET","NEW","NIL","NIP","NOD","NOR","NOT","NOW","NUN","NUT",
    "OAK","OAR","OAT","ODD","OFF","OIL","OLD","ONE","ORB","ORE","OUR","OUT","OWE","OWL","OWN",
    "PAD","PAL","PAN","PAR","PAT","PAW","PAY","PEA","PEN","PER","PET","PIE","PIG","PIN","PIT","PLY","POD","POP","POT","PRO","PUB","PUN","PUP","PUT",
    "RAG","RAM","RAN","RAP","RAT","RAW","RAY","RED","RIB","RID","RIG","RIM","RIP","ROB","ROD","ROT","ROW","RUB","RUG","RUM","RUN",
    "SAD","SAG","SAP","SAT","SAW","SAY","SEA","SET","SEW","SHE","SHY","SIN","SIP","SIR","SIT","SIX","SKI","SKY","SLY","SOB","SOD","SON","SOW","SOY","SPA","SPY","SUB","SUM","SUN","SUP",
    "TAB","TAD","TAG","TAN","TAP","TAR","TAX","TEA","TEN","THE","TIE","TIN","TIP","TOE","TON","TOO","TOP","TOW","TOY","TRY","TUB","TUG","TWO",
    "URN","USE",
    "VAN","VAT","VET","VIA","VOW",
    "WAD","WAG","WAR","WAS","WAX","WAY","WEB","WED","WEE","WET","WHO","WHY","WIG","WIN","WIT","WOE","WON","WOO","WOW",
    "YAK","YAM","YAP","YAW","YEA","YES","YET","YOU",
    "ZAP","ZEN","ZIP","ZOO",
    "ABLE","ACID","AGED","AIMS","AKIN","ALSO","AREA","ARMY","ARTS","ATOM","AUNT","AVID","AWAY",
    "BACK","BAKE","BALL","BAND","BANK","BARE","BARK","BARN","BASE","BATH","BEAM","BEAN","BEAR","BEAT","BEEN","BELL","BELT","BEND","BEST","BETA","BIKE","BILL","BIND","BIRD","BITE","BLOW","BLUE","BOAT","BODY","BOIL","BOLD","BOMB","BOND","BONE","BOOK","BOOM","BOOT","BORE","BORN","BOSS","BOTH","BOWL","BURN","BUSH","BUSY","BYTE",
    "CAFE","CAGE","CAKE","CALL","CALM","CAME","CAMP","CARD","CARE","CART","CASE","CASH","CAST","CAVE","CELL","CENT","CHAT","CHEF","CHEW","CHIN","CHIP","CHOP","CITY","CLAM","CLAP","CLAW","CLAY","CLIP","CLUB","CLUE","COAL","COAT","CODE","COIL","COIN","COLD","COMA","COMB","COME","CONE","COOK","COOL","COPE","COPY","CORD","CORE","CORK","CORN","COST","COZY","CRAB","CREW","CROP","CROW","CUBE","CURE","CURL","CUTE",
    "DAMP","DARE","DARK","DART","DASH","DATA","DATE","DAWN","DAYS","DEAD","DEAF","DEAL","DEAR","DEBT","DECK","DEED","DEEP","DEER","DEMO","DENY","DESK","DIAL","DICE","DIET","DIME","DINE","DIRT","DISC","DISH","DISK","DIVE","DOCK","DOES","DOLE","DOLL","DONE","DOOM","DOOR","DOSE","DOWN","DRAG","DRAW","DREW","DRIP","DROP","DRUG","DRUM","DUAL","DUCK","DUEL","DUET","DULL","DUMB","DUMP","DUNE","DUSK","DUST","DUTY",
    "EACH","EARL","EARN","EASE","EAST","EASY","EDGE","EDIT","ELSE","EMIT","ENVY","EPIC","EVEN","EVER","EVIL","EXAM","EXIT","FACE","FACT","FADE","FAIL","FAIR","FAKE","FALL","FAME","FANG","FARE","FARM","FAST","FATE","FEAR","FEAT","FEED","FEEL","FELL","FELT","FILE","FILL","FILM","FIND","FINE","FIRE","FIRM","FISH","FIST","FIVE","FLAG","FLAP","FLAT","FLAW","FLEA","FLED","FLEE","FLEW","FLEX","FLIP","FLOW","FOAM","FOIL","FOLD","FOLK","FOND","FOOD","FOOL","FOOT","FORD","FORK","FORM","FORT","FOUL","FOUR","FREE","FROG","FROM","FUEL","FULL","FUME","FUND","FURY","FUSE","FUSS","FUZZ",
    "GAIN","GALA","GAME","GANG","GATE","GAVE","GAZE","GEAR","GEMS","GENE","GIFT","GIRL","GIVE","GLAD","GLEE","GLEN","GLOW","GLUE","GOAL","GOAT","GOES","GOLD","GOLF","GONE","GOOD","GOSH","GRAB","GRAM","GRAY","GREW","GREY","GRID","GRIM","GRIN","GRIP","GROW","GULF","GUSH","GUST","HACK","HAIL","HAIR","HALF","HALL","HALT","HAND","HANG","HARD","HARM","HATE","HAUL","HAVE","HAWK","HAZE","HEAD","HEAL","HEAP","HEAR","HEAT","HEEL","HELD","HELL","HELP","HERB","HERD","HERE","HERO","HIDE","HIGH","HIKE","HILL","HINT","HIRE","HOLD","HOLE","HOME","HONE","HOOD","HOOK","HOPE","HORN","HOSE","HOST","HOUR","HOWL","HUGE","HULL","HUNG","HUNK","HUNT","HURT","HUSH","IDEA","IDLE","IDOL","INCH","INFO","INTO","IRIS","IRON","ISLE","ITEM",
    "JACK","JADE","JAIL","JAZZ","JEAN","JEEP","JOIN","JOKE","JOLT","JUMP","JUNK","JURY","JUST","KEEN","KEEP","KICK","KILL","KIND","KING","KISS","KITE","KNEE","KNEW","KNIT","KNOB","KNOT","KNOW",
    "LACE","LACK","LADY","LAID","LAKE","LAMB","LAME","LAMP","LAND","LANE","LARK","LAST","LATE","LAWN","LAZY","LEAD","LEAF","LEAK","LEAN","LEAP","LEFT","LEND","LENS","LESS","LIAR","LICK","LIED","LIFE","LIFT","LIKE","LILY","LIMB","LIME","LIMP","LINE","LINK","LION","LISP","LIST","LIVE","LOAD","LOAF","LOAN","LOCK","LOFT","LOGO","LONE","LONG","LOOK","LOOM","LOOP","LORD","LOSE","LOSS","LOST","LOUD","LOVE","LUCK","LUMP","LUNG","LURE","LUSH","LUST",
    "MADE","MAID","MAIL","MAIN","MAKE","MALE","MALL","MALT","MANE","MANY","MARE","MARK","MARS","MART","MASH","MASK","MASS","MAST","MATE","MATH","MAZE","MEAL","MEAN","MEAT","MEET","MELT","MEMO","MEND","MENU","MESH","MESS","MICE","MILD","MILE","MILK","MILL","MIND","MINE","MINT","MISS","MIST","MOAT","MOCK","MODE","MOLD","MOLE","MONK","MOOD","MOON","MOOR","MORE","MOSS","MOST","MOTH","MOVE","MUCH","MUCK","MULE","MUSE","MUSH","MUST","MUTE","MYTH",
    "NAIL","NAME","NAVY","NEAR","NEAT","NECK","NEED","NEST","NEWS","NEXT","NICE","NICK","NINE","NODE","NONE","NOOK","NOON","NOPE","NORM","NOSE","NOTE","NOUN","NUDE","NULL","NUMB",
    "OBEY","ODOR","OILY","OMEN","OMIT","ONCE","ONLY","ONTO","OOZE","OPAL","OPEN","ORAL","ORCA","OUST","OVAL","OVEN","OVER","OWED",
    "PACE","PACK","PACT","PAGE","PAID","PAIL","PAIN","PAIR","PALE","PALM","PARK","PART","PASS","PAST","PATH","PAVE","PAWN","PEAK","PEAR","PEAT","PECK","PEEL","PEER","PELT","PERK","PEST","PICK","PIER","PIKE","PILE","PILL","PINE","PINT","PIPE","PLAN","PLAY","PLEA","PLOD","PLOT","PLOW","PLUG","PLUM","PLUS","POEM","POET","POKE","POLE","POLL","POND","POOL","POOR","POPE","PORE","PORK","PORT","POSE","POST","POUR","PRAY","PREY","PROP","PULL","PULP","PUMP","PUNK","PUNT","PURE","PUSH",
    "QUIZ","RACE","RACK","RAFT","RAGE","RAID","RAIL","RAIN","RAKE","RAMP","RANK","RARE","RASH","RATE","RAVE","READ","REAL","REAP","REAR","REED","REEF","REEL","RELY","RENT","REST","RICE","RICH","RIDE","RIFE","RIFT","RILE","RING","RIOT","RIPE","RISE","RISK","RITE","ROAD","ROAM","ROAR","ROBE","ROCK","RODE","ROLE","ROLL","ROOF","ROOM","ROOT","ROPE","ROSE","ROSY","ROUT","ROVE","RUBY","RUDE","RUIN","RULE","RUMP","RUNE","RUNG","RUSH","RUST",
    "SACK","SAFE","SAGA","SAGE","SAID","SAIL","SAKE","SALE","SALT","SAME","SAND","SANE","SANG","SANK","SAVE","SCAN","SCAR","SEAL","SEAM","SEAR","SEAT","SEED","SEEK","SEEM","SEEN","SELF","SELL","SEND","SENT","SETS","SHED","SHIP","SHOE","SHOP","SHOT","SHOW","SHUT","SICK","SIDE","SIFT","SIGH","SIGN","SILK","SILL","SILO","SING","SINK","SITE","SIZE","SKIM","SKIN","SKIP","SLAB","SLAM","SLAP","SLAT","SLAY","SLED","SLEW","SLID","SLIM","SLIP","SLIT","SLOW","SLUG","SLUM","SLUR","SNAP","SNOW","SOAK","SOAP","SOAR","SODA","SOFA","SOFT","SOIL","SOLD","SOLE","SOLO","SOME","SONG","SOON","SORE","SORT","SOUL","SOUP","SOUR","SPAN","SPAR","SPAT","SPIN","SPIT","SPOT","STAR","STAY","STEM","STEP","STEW","STIR","STOP","STOW","STUB","STUD","SUCH","SUIT","SULK","SUMS","SUNK","SURE","SURF","SWAN","SWAP","SWAT","SWAY","SWIM",
    "TACK","TACO","TAIL","TAKE","TALE","TALK","TALL","TAME","TANK","TAPE","TART","TASK","TAXI","TEAM","TEAR","TELL","TEND","TENT","TERM","TEST","TEXT","THAN","THAT","THAW","THEE","THEM","THEN","THEY","THIN","THIS","THUD","TICK","TIDE","TIDY","TIED","TIER","TILE","TILL","TILT","TIME","TINY","TIRE","TOAD","TOFU","TOIL","TOLD","TOLL","TOMB","TONE","TOOK","TOOL","TOPS","TORE","TORN","TOSS","TOTE","TOUR","TOWN","TOYS","TRAM","TRAP","TRAY","TREE","TREK","TRIM","TRIO","TRIP","TROT","TRUE","TUBE","TUCK","TUNA","TUNE","TURF","TURN","TUSK","TWIN","TYPE",
    "UGLY","UNDO","UNIT","UNTO","UPON","URGE","USED","USER","VAIN","VALE","VARY","VASE","VAST","VEIL","VEIN","VENT","VERB","VERY","VEST","VETO","VIAL","VIBE","VICE","VIEW","VILE","VINE","VISA","VOID","VOLT","VOTE",
    "WADE","WAGE","WAIL","WAIT","WAKE","WALK","WALL","WAND","WANE","WANT","WARD","WARM","WARN","WARP","WART","WARY","WASH","WASP","WAVE","WAVY","WEAK","WEAR","WEED","WEEK","WELD","WELL","WENT","WERE","WEST","WHAT","WHEN","WHIP","WHIZ","WIDE","WIFE","WILD","WILL","WILT","WIND","WINE","WING","WINK","WIPE","WIRE","WISE","WISH","WITH","WOLF","WOMB","WOOD","WOOL","WORD","WORE","WORK","WORM","WORN","WRAP","YARD","YARN","YAWN","YEAR","YELL","YELP","YOGA","YOKE","YOLK","YOUR","ZEAL","ZERO","ZEST","ZINC","ZONE","ZOOM",
    "AFTER","AGAIN","AGENT","AGREE","AHEAD","ALARM","ALBUM","ALERT","ALIEN","ALIGN","ALIKE","ALIVE","ALLOW","ALONE","ALONG","ALTER","AMONG","ANGEL","ANGER","ANGLE","ANGRY","APART","APPLE","APPLY","ARENA","ARGUE","ARISE","ARMOR","ARROW","ASIDE","ASSET","AUDIO","AVOID","AWAIT","AWARD","AWARE","BADGE","BAKER","BASES","BASIC","BASIN","BASIS","BATCH","BEACH","BEANS","BEARD","BEARS","BEAST","BEGAN","BEGIN","BEING","BELLS","BELOW","BENCH","BERRY","BIRTH","BLACK","BLADE","BLAME","BLANK","BLAST","BLAZE","BLEED","BLEND","BLIND","BLOCK","BLOOD","BLOOM","BOARD","BOOST","BOOTH","BOUND","BRAIN","BRAND","BRASS","BRAVE","BREAD","BREAK","BREED","BRICK","BRIDE","BRIEF","BRING","BROAD","BROKE","BROOK","BROWN","BRUSH","BUILD","BUILT","BUYER",
    "CABIN","CABLE","CANDY","CARGO","CARRY","CATCH","CAUSE","CHAIN","CHAIR","CHARM","CHART","CHASE","CHEAP","CHECK","CHEER","CHEST","CHIEF","CHILD","CHILL","CHINA","CHOSE","CHUNK","CIVIL","CLAIM","CLASS","CLEAN","CLEAR","CLERK","CLICK","CLIFF","CLIMB","CLING","CLOCK","CLOSE","CLOTH","CLOUD","COACH","COAST","COLOR","COMET","COMIC","CORAL","COSTS","COUCH","COULD","COUNT","COURT","COVER","CRAFT","CRANE","CRASH","CRAZY","CREAM","CREEK","CRIME","CRISP","CROSS","CROWD","CROWN","CRUEL","CRUSH","CURVE","CYCLE",
    "DAILY","DAIRY","DANCE","DATED","DEALS","DEATH","DEBUT","DECAY","DECOR","DELAY","DELTA","DENSE","DEPTH","DIARY","DIGIT","DIRTY","DISCO","DIVER","DOUBT","DOUGH","DOZEN","DRAFT","DRAIN","DRAMA","DRANK","DRAWN","DREAM","DRESS","DRIED","DRIFT","DRILL","DRINK","DRIVE","DRONE","DROVE","DRUNK","DUSTY","EAGER","EAGLE","EARLY","EARTH","EASEL","EATEN","EIGHT","ELBOW","ELDER","ELECT","ELITE","EMAIL","EMPTY","ENEMY","ENJOY","ENTER","ENTRY","EQUAL","ERROR","ESSAY","EVENT","EVERY","EXACT","EXAMS","EXCEL","EXIST","EXTRA",
    "FABLE","FACED","FACTS","FAINT","FAITH","FALSE","FANCY","FATAL","FAULT","FAVOR","FEAST","FENCE","FEVER","FIBER","FIELD","FIFTH","FIFTY","FIGHT","FINAL","FINDS","FIRST","FIXED","FLAME","FLASH","FLEET","FLESH","FLOAT","FLOOD","FLOOR","FLOUR","FLUID","FOCUS","FORCE","FORMS","FORTH","FORTY","FORUM","FOUND","FRAME","FRANK","FRESH","FRIED","FRONT","FROST","FROWN","FRUIT","FULLY","FUNNY","GIANT","GIVEN","GLASS","GLOBE","GLORY","GOING","GRACE","GRADE","GRAIN","GRAND","GRANT","GRAPE","GRAPH","GRASP","GRASS","GRAVE","GREAT","GREEN","GREET","GRIEF","GRILL","GROSS","GROUP","GROVE","GROWN","GUARD","GUESS","GUEST","GUIDE","GUILD","HABIT","HAPPY","HARSH","HASTE","HEART","HEAVY","HEDGE","HELLO","HENCE","HORSE","HOTEL","HOUND","HOURS","HOUSE","HUMAN","HUMOR","HURRY","IDEAL","IMAGE","IMPLY","INDEX","INNER","INPUT","INTRO","IRON","ISSUE","IVORY",
    "JEANS","JOINS","JOINT","JOKER","JUDGE","JUICE","KINDS","KNEEL","KNIFE","KNOCK","KNOWN","LABEL","LABOR","LARGER","LASER","LATER","LAUGH","LAYER","LEARN","LEASE","LEAST","LEAVE","LEGAL","LEMON","LEVEL","LIGHT","LIKED","LIMIT","LINED","LINEN","LIVER","LOANS","LOBBY","LOCAL","LODGE","LOGIC","LOOSE","LORRY","LOSER","LOVER","LOWER","LOYAL","LUCKY","LUNCH","LYRIC","MACRO","MAGIC","MAJOR","MAKER","MANGO","MANOR","MAPLE","MARCH","MARRY","MATCH","MAYBE","MAYOR","MEANS","MEDAL","MEDIA","MERCY","MERGE","MERIT","MERRY","METAL","METER","MIGHT","MINOR","MINUS","MIXED","MODEL","MODEM","MONEY","MONTH","MORAL","MOTOR","MOUNT","MOUSE","MOUTH","MOVED","MOVIE","MUSIC","NAIVE","NAKED","NAMED","NASTY","NAVAL","NEEDS","NERVE","NEVER","NEWER","NEWLY","NIGHT","NINTH","NOBLE","NOISE","NOISY","NORTH","NOTED","NOVEL","NURSE","OCCUR","OCEAN","OFFER","OFTEN","OLDER","OLIVE","ONION","ONSET","OPERA","ORBIT","ORDER","ORGAN","OTHER","OUGHT","OUNCE","OUTER","OWNED","OWNER","OXIDE","PAINT","PANEL","PANIC","PAPER","PARTY","PASTA","PASTE","PATCH","PAUSE","PEACE","PEACH","PEARL","PHASE","PHONE","PHOTO","PIANO","PIECE","PILOT","PITCH","PIXEL","PLACE","PLAIN","PLANE","PLANT","PLATE","PLAYS","PLAZA","PLEAD","PLUCK","POINT","PORCH","POUND","POWER","PRESS","PRICE","PRIDE","PRIME","PRINT","PRIOR","PRIZE","PROBE","PROOF","PROUD","PROVE","PROXY","PSALM","PULSE","PUNCH","PUPIL","PURSE","QUEEN","QUERY","QUEST","QUEUE","QUICK","QUIET","QUILT","QUITE","QUOTE",
    "RADIO","RAISE","RALLY","RANGE","RAPID","RATES","RATIO","REACH","REACT","READY","REALM","REBEL","REFER","REIGN","RELAX","RELAY","RENEW","REPAY","REPLY","RIDER","RIDGE","RIGHT","RIGID","RIVER","ROBOT","ROCKY","ROGUE","ROMAN","ROOMS","ROUGH","ROUND","ROUTE","ROYAL","RUGBY","RULER","RUMOR","RURAL","SAFER","SAINT","SALAD","SALES","SALON","SANDY","SAUCE","SCALE","SCARE","SCENE","SCENT","SCORE","SCOUT","SCRAP","SENSE","SERVE","SETUP","SEVEN","SHADE","SHAKE","SHALL","SHAME","SHAPE","SHARE","SHARK","SHARP","SHEEP","SHEER","SHEET","SHELF","SHELL","SHIFT","SHINE","SHIRT","SHOCK","SHOOT","SHORE","SHORT","SHOUT","SHOWN","SIDED","SIGHT","SIGNS","SILLY","SINCE","SIXTH","SIXTY","SIZED","SKATE","SKILL","SKIRT","SKULL","SLATE","SLEEP","SLICE","SLIDE","SLOPE","SMALL","SMART","SMELL","SMILE","SMOKE","SNAKE","SNEAK","SOLAR","SOLID","SOLVE","SORRY","SOUND","SOUTH","SPACE","SPADE","SPARE","SPARK","SPEAK","SPEAR","SPEED","SPELL","SPEND","SPENT","SPICE","SPIKE","SPINE","SPLIT","SPOIL","SPOKE","SPOON","SPORT","SPRAY","SQUAD","STACK","STAFF","STAGE","STAIN","STAIR","STAKE","STALE","STAMP","STAND","STARE","STARK","START","STATE","STEAK","STEAL","STEAM","STEEL","STEEP","STEER","STICK","STIFF","STILL","STOCK","STONE","STOOD","STOOL","STORE","STORM","STORY","STOVE","STRAP","STRAW","STRAY","STRIP","STUCK","STUDY","STUFF","STYLE","SUGAR","SUITE","SUNNY","SUPER","SURGE","SWAMP","SWEAR","SWEAT","SWEEP","SWEET","SWELL","SWEPT","SWIFT","SWING","SWIPE","SWORD","TABLE","TAKEN","TALES","TASTE","TAXES","TEACH","TEAMS","TEASE","TEETH","TEMPO","TENSE","TERMS","THANK","THEFT","THEIR","THEME","THERE","THESE","THICK","THIEF","THING","THINK","THIRD","THOSE","THREE","THREW","THROW","THUMB","TIGER","TIGHT","TIMES","TIRED","TITLE","TODAY","TOKEN","TOOTH","TOPIC","TOTAL","TOUCH","TOUGH","TOWEL","TOWER","TOXIC","TRACE","TRACK","TRADE","TRAIL","TRAIN","TRAIT","TRASH","TREAT","TREND","TRIAL","TRIBE","TRICK","TRIED","TRIPS","TROLL","TROOP","TRUCK","TRULY","TRUNK","TRUST","TRUTH","TUTOR","TWICE","TWIST","TYPES","UNCLE","UNDER","UNIFY","UNION","UNITE","UNITY","UNTIL","UPPER","UPSET","URBAN","USAGE","USUAL","UTTER","VAGUE","VALID","VALUE","VALVE","VAPOR","VAULT","VENUE","VIDEO","VIVID","VOCAL","VOICE","VOTER","WAGES","WAGON","WAIST","WASTE","WATCH","WATER","WEARY","WEAVE","WEDGE","WEIGH","WEIRD","WHALE","WHEAT","WHEEL","WHERE","WHICH","WHILE","WHITE","WHOLE","WHOSE","WIDEN","WIDTH","WOMAN","WOMEN","WORLD","WORRY","WORSE","WORST","WORTH","WOULD","WOUND","WRIST","WRITE","WRONG","WROTE","YACHT","YEARS","YIELD","YOUNG","YOUTH","ZEBRA"
  ];

  var DICTIONARY = (function () {
    var set = {};
    for (var i = 0; i < BASE_WORDS.length; i++) {
      set[BASE_WORDS[i]] = true;
    }
    return set;
  })();

  function isDictionaryWord(word) {
    var w = normalizeWord(word);
    if (w.length < MIN_WORD_LEN || w.length > MAX_WORD_LEN) {
      return false;
    }
    return !!DICTIONARY[w];
  }

  /**
   * Resolve a swiped path to a dictionary word.
   * Accepts the forward spelling or the reverse (swipe either direction).
   * If both are valid and different, prefer the forward swipe.
   */
  function resolvePathWord(grid, indices) {
    var forward = pathToWord(grid, indices);
    var backward = reverseWord(forward);
    var forwardOk = isDictionaryWord(forward);
    var backwardOk = isDictionaryWord(backward);
    if (forwardOk) {
      return { word: forward, reversed: false };
    }
    if (backwardOk) {
      return { word: backward, reversed: true };
    }
    return { word: "", reversed: false, attempted: forward };
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashDateKey(dateKey) {
    var h = 2166136261;
    for (var i = 0; i < dateKey.length; i++) {
      h ^= dateKey.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function formatDateKey(date) {
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return (
      y +
      "-" +
      (m < 10 ? "0" : "") +
      m +
      "-" +
      (d < 10 ? "0" : "") +
      d
    );
  }

  function parseDateKey(dateKey) {
    var parts = String(dateKey).split("-");
    if (parts.length !== 3) {
      return null;
    }
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (!y || !m || !d) {
      return null;
    }
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      return null;
    }
    return dt;
  }

  function shiftDateKey(dateKey, deltaDays) {
    var dt = parseDateKey(dateKey);
    if (!dt) {
      return dateKey;
    }
    dt.setDate(dt.getDate() + deltaDays);
    return formatDateKey(dt);
  }

  function todayKey(now) {
    return formatDateKey(now || new Date());
  }

  var WORDS_BY_LENGTH = (function () {
    var byLen = {};
    for (var i = 0; i < BASE_WORDS.length; i++) {
      var w = BASE_WORDS[i];
      var len = w.length;
      if (!byLen[len]) {
        byLen[len] = [];
      }
      byLen[len].push(w);
    }
    return byLen;
  })();

  function shuffleInPlace(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function canPartition(remaining, minLen, maxLen, memo) {
    if (remaining === 0) {
      return true;
    }
    if (remaining < minLen) {
      return false;
    }
    if (memo[remaining] !== undefined) {
      return memo[remaining];
    }
    for (var L = minLen; L <= maxLen && L <= remaining; L++) {
      if (canPartition(remaining - L, minLen, maxLen, memo)) {
        memo[remaining] = true;
        return true;
      }
    }
    memo[remaining] = false;
    return false;
  }

  function randomPartition(total, minLen, maxLen, rand) {
    var result = [];
    var memo = {};
    function tryPart(remaining) {
      if (remaining === 0) {
        return true;
      }
      if (remaining < minLen) {
        return false;
      }
      var options = [];
      for (var L = minLen; L <= maxLen && L <= remaining; L++) {
        if (canPartition(remaining - L, minLen, maxLen, memo)) {
          options.push(L);
        }
      }
      if (!options.length) {
        return false;
      }
      shuffleInPlace(options, rand);
      for (var i = 0; i < options.length; i++) {
        var len = options[i];
        if (tryPart(remaining - len)) {
          result.push(len);
          return true;
        }
      }
      return false;
    }
    if (!tryPart(total)) {
      return null;
    }
    return result;
  }

  function findPathOfLength(start, size, blocked, len, rand) {
    var path = [start];
    var inPath = {};
    inPath[start] = true;
    var found = null;

    function dfs(idx) {
      if (found) {
        return;
      }
      if (path.length === len) {
        found = path.slice();
        return;
      }
      var neighbors = [];
      var cells = size * size;
      for (var j = 0; j < cells; j++) {
        if (!blocked[j] && !inPath[j] && areAdjacent(idx, j, size)) {
          neighbors.push(j);
        }
      }
      shuffleInPlace(neighbors, rand);
      for (var k = 0; k < neighbors.length; k++) {
        var next = neighbors[k];
        path.push(next);
        inPath[next] = true;
        dfs(next);
        if (found) {
          return;
        }
        path.pop();
        delete inPath[next];
      }
    }

    dfs(start);
    return found;
  }

  function pickRandomPath(size, blocked, len, rand) {
    var cells = size * size;
    var starts = [];
    for (var i = 0; i < cells; i++) {
      if (!blocked[i]) {
        starts.push(i);
      }
    }
    shuffleInPlace(starts, rand);
    for (var s = 0; s < starts.length; s++) {
      var path = findPathOfLength(starts[s], size, blocked, len, rand);
      if (path) {
        return path;
      }
    }
    return null;
  }

  function buildSeedGrid(size, rand, partitionOverride) {
    var partition =
      partitionOverride ||
      randomPartition(size * size, MIN_WORD_LEN, MAX_WORD_LEN, rand);
    if (!partition) {
      return null;
    }
    if (!partitionOverride) {
      shuffleInPlace(partition, rand);
    }

    var blocked = {};
    var grid = new Array(size * size);
    var seedWords = [];

    for (var p = 0; p < partition.length; p++) {
      var wordLen = partition[p];
      var path = pickRandomPath(size, blocked, wordLen, rand);
      if (!path) {
        return null;
      }
      var candidates = WORDS_BY_LENGTH[wordLen];
      if (!candidates || !candidates.length) {
        return null;
      }
      var word = candidates[Math.floor(rand() * candidates.length)];
      for (var i = 0; i < wordLen; i++) {
        grid[path[i]] = word.charAt(i);
        blocked[path[i]] = true;
      }
      seedWords.push({ word: word, path: path.slice() });
    }

    return { grid: grid, seedWords: seedWords };
  }

  function buildSeedGridDescending(size, rand) {
    var partition = randomPartition(size * size, MIN_WORD_LEN, MAX_WORD_LEN, rand);
    if (!partition) {
      return null;
    }
    partition.sort(function (a, b) {
      return b - a;
    });
    return buildSeedGrid(size, rand, partition);
  }

  var FALLBACK_PARTITIONS = [
    [5, 5, 5, 5, 5],
    [8, 8, 5, 4],
    [8, 7, 5, 5],
    [6, 6, 6, 4, 3],
    [4, 4, 4, 4, 4, 5],
    [3, 3, 3, 4, 4, 4, 4],
  ];

  function seedCoversAllCells(seedWords, size) {
    var claimed = {};
    if (!Array.isArray(seedWords)) {
      return false;
    }
    for (var i = 0; i < seedWords.length; i++) {
      var path = seedWords[i] && seedWords[i].path;
      if (!Array.isArray(path)) {
        return false;
      }
      for (var j = 0; j < path.length; j++) {
        claimed[path[j]] = true;
      }
    }
    return countClaimed(claimed) === size * size;
  }

  function generateGrid(dateKey, size) {
    size = size || GRID_SIZE;
    var cacheKey = dateKey + ":" + size;
    if (puzzleCache[cacheKey]) {
      return puzzleCache[cacheKey];
    }

    var rand = mulberry32(hashDateKey(dateKey + ":grid"));
    var best = null;

    for (var attempt = 0; attempt < GENERATOR_ATTEMPTS; attempt++) {
      var built = buildSeedGrid(size, rand);
      if (!built) {
        built = buildSeedGridDescending(size, rand);
      }
      if (!built || !seedCoversAllCells(built.seedWords, size)) {
        continue;
      }
      var solution = findAllWords(built.grid, size);
      if (!solution.words.length) {
        continue;
      }
      if (!best || solution.words.length > best.solution.words.length) {
        best = {
          grid: built.grid,
          solution: solution,
          seedWords: built.seedWords,
        };
      }
      if (solution.words.length >= TARGET_WORD_COUNT) {
        break;
      }
    }

    if (!best) {
      for (var f = 0; f < FALLBACK_PARTITIONS.length; f++) {
        for (var fb = 0; fb < 30; fb++) {
          var fallbackBuilt = buildSeedGrid(size, rand, FALLBACK_PARTITIONS[f].slice());
          if (!fallbackBuilt || !seedCoversAllCells(fallbackBuilt.seedWords, size)) {
            continue;
          }
          var fallbackSolution = findAllWords(fallbackBuilt.grid, size);
          if (!fallbackSolution.words.length) {
            continue;
          }
          if (!best || fallbackSolution.words.length > best.solution.words.length) {
            best = {
              grid: fallbackBuilt.grid,
              solution: fallbackSolution,
              seedWords: fallbackBuilt.seedWords,
            };
          }
          if (fallbackSolution.words.length >= TARGET_WORD_COUNT) {
            break;
          }
        }
        if (best && best.solution.words.length >= TARGET_WORD_COUNT) {
          break;
        }
      }
    }

    if (!best) {
      throw new Error("SumSwipe: failed to generate puzzle for " + dateKey);
    }

    var rows = [];
    for (var r = 0; r < size; r++) {
      rows.push(best.grid.slice(r * size, r * size + size).join(""));
    }

    var puzzle = {
      dateKey: dateKey,
      size: size,
      grid: best.grid.slice(),
      rows: rows,
      words: best.solution.words.slice(),
      wordCount: best.solution.words.length,
      seedWords: best.seedWords,
      cellCount: size * size,
    };
    puzzleCache[cacheKey] = puzzle;
    return puzzle;
  }

  function findAllWords(grid, size) {
    var found = {};
    var neighbors = [];
    var i;
    for (i = 0; i < grid.length; i++) {
      neighbors[i] = [];
      for (var j = 0; j < grid.length; j++) {
        if (areAdjacent(i, j, size)) {
          neighbors[i].push(j);
        }
      }
    }

    function dfs(idx, used, letters) {
      if (letters.length >= MIN_WORD_LEN && letters.length <= MAX_WORD_LEN) {
        if (DICTIONARY[letters]) {
          found[letters] = true;
        }
      }
      if (letters.length >= MAX_WORD_LEN) {
        return;
      }
      var nexts = neighbors[idx];
      for (var n = 0; n < nexts.length; n++) {
        var next = nexts[n];
        if (used[next]) {
          continue;
        }
        used[next] = true;
        dfs(next, used, letters + grid[next]);
        delete used[next];
      }
    }

    for (i = 0; i < grid.length; i++) {
      var used = {};
      used[i] = true;
      dfs(i, used, grid[i]);
    }

    var words = Object.keys(found).sort();
    return {
      words: words,
      wordCount: words.length,
    };
  }

  /**
   * Normalize saved finds to [{ word, path, points }, ...] without overlaps.
   */
  function sanitizeFoundEntries(raw, grid, size, validSet) {
    var claimed = {};
    var out = [];
    if (!Array.isArray(raw)) {
      return { found: [], claimed: claimed };
    }
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      if (!item || !item.word) {
        continue;
      }
      var w = normalizeWord(item.word);
      if (!isDictionaryWord(w)) {
        continue;
      }
      if (validSet && !validSet[w]) {
        continue;
      }
      var path = item.path;
      if (!Array.isArray(path) || !isValidPath(path, size)) {
        continue;
      }
      if (pathUsesClaimed(path, claimed)) {
        continue;
      }
      var resolved = resolvePathWord(grid, path);
      if (resolved.word !== w) {
        continue;
      }
      var pts = wordPoints(w);
      claimPath(claimed, path);
      out.push({ word: w, path: path.slice(), points: pts });
    }
    out.sort(function (a, b) {
      return a.word.localeCompare(b.word);
    });
    return { found: out, claimed: claimed };
  }

  function earliestDateKey(now) {
    return shiftDateKey(todayKey(now), -MAX_HISTORY_DAYS);
  }

  function clearPuzzleCache() {
    puzzleCache = {};
  }

  return {
    MIN_WORD_LEN: MIN_WORD_LEN,
    MAX_WORD_LEN: MAX_WORD_LEN,
    GRID_SIZE: GRID_SIZE,
    FILL_BONUS: FILL_BONUS,
    MAX_HISTORY_DAYS: MAX_HISTORY_DAYS,
    TARGET_WORD_COUNT: TARGET_WORD_COUNT,
    GENERATOR_ATTEMPTS: GENERATOR_ATTEMPTS,
    letterValue: letterValue,
    wordSum: wordSum,
    lengthFactor: lengthFactor,
    wordPoints: wordPoints,
    scoreWordsWithFill: scoreWordsWithFill,
    normalizeWord: normalizeWord,
    reverseWord: reverseWord,
    indexToRowCol: indexToRowCol,
    rowColToIndex: rowColToIndex,
    areAdjacent: areAdjacent,
    pathTapAction: pathTapAction,
    focusAfterBackspace: focusAfterBackspace,
    countsTowardDoubleTap: countsTowardDoubleTap,
    isDoubleTap: isDoubleTap,
    isValidPath: isValidPath,
    isCellClaimed: isCellClaimed,
    countClaimed: countClaimed,
    claimPath: claimPath,
    pathUsesClaimed: pathUsesClaimed,
    rebuildClaimedFromFound: rebuildClaimedFromFound,
    pathToWord: pathToWord,
    flattenGrid: flattenGrid,
    isDictionaryWord: isDictionaryWord,
    resolvePathWord: resolvePathWord,
    mulberry32: mulberry32,
    hashDateKey: hashDateKey,
    formatDateKey: formatDateKey,
    parseDateKey: parseDateKey,
    shiftDateKey: shiftDateKey,
    todayKey: todayKey,
    earliestDateKey: earliestDateKey,
    randomPartition: randomPartition,
    generateGrid: generateGrid,
    findAllWords: findAllWords,
    sanitizeFoundEntries: sanitizeFoundEntries,
    clearPuzzleCache: clearPuzzleCache,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = SumSwipeUtils;
}

(function () {
  "use strict";

  if (typeof document === "undefined") {
    return;
  }

  var root = document.getElementById("sumSwipeTool");
  if (!root) {
    return;
  }

  var utils = SumSwipeUtils;
  var storageKey = "sumswipe-daily-v5";

  var state = {
    dateKey: utils.todayKey(),
    puzzle: null,
    validSet: {},
    found: [],
    claimed: {},
    path: [],
    dragging: false,
    pointerId: null,
    dragMoved: false,
    dragStartX: 0,
    dragStartY: 0,
    gestureChangedPath: false,
    gestureStartLen: 0,
    lastTapTime: 0,
    lastTapIndex: -1,
    focusIndex: 0,
  };

  var els = {
    title: document.getElementById("ssTitle"),
    blurb: document.getElementById("ssBlurb"),
    progress: document.getElementById("ssProgress"),
    grid: document.getElementById("ssGrid"),
    pathSvg: document.getElementById("ssPathSvg"),
    liveWord: document.getElementById("ssLiveWord"),
    liveSum: document.getElementById("ssLiveSum"),
    liveEq: document.getElementById("ssLiveEq"),
    scoreValue: document.getElementById("ssScoreValue"),
    fillValue: document.getElementById("ssFillValue"),
    fillMax: document.getElementById("ssFillMax"),
    fillBar: document.getElementById("ssFillBar"),
    foundList: document.getElementById("ssFoundList"),
    foundCount: document.getElementById("ssFoundCount"),
    status: document.getElementById("ssStatus"),
    prev: document.getElementById("ssPrev"),
    next: document.getElementById("ssNext"),
    today: document.getElementById("ssToday"),
    clear: document.getElementById("ssClear"),
    submit: document.getElementById("ssSubmit"),
    reset: document.getElementById("ssResetPuzzle"),
  };

  function loadAllProgress() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) {
        return {};
      }
      var data = JSON.parse(raw);
      return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch (e) {
      return {};
    }
  }

  function saveProgress() {
    try {
      var all = loadAllProgress();
      all[state.dateKey] = { found: state.found.slice() };
      localStorage.setItem(storageKey, JSON.stringify(all));
    } catch (e) {
      // ignore quota / private mode
    }
  }

  function restoreProgress() {
    var all = loadAllProgress();
    var saved = all[state.dateKey];
    var raw = saved && Array.isArray(saved.found) ? saved.found : [];
    var cleaned = utils.sanitizeFoundEntries(
      raw,
      state.puzzle.grid,
      state.puzzle.size,
      state.validSet
    );
    state.found = cleaned.found;
    state.claimed = cleaned.claimed;
  }

  function setStatus(msg, kind) {
    els.status.textContent = msg || "";
    els.status.classList.remove("is-error", "is-success");
    if (kind === "error") {
      els.status.classList.add("is-error");
    } else if (kind === "success") {
      els.status.classList.add("is-success");
    }
  }

  function claimedCount() {
    return utils.countClaimed(state.claimed);
  }

  function cellTotal() {
    return state.puzzle ? state.puzzle.size * state.puzzle.size : utils.GRID_SIZE * utils.GRID_SIZE;
  }

  function currentScore() {
    return utils.scoreWordsWithFill(state.found, claimedCount(), state.puzzle.size);
  }

  function foundWordCount() {
    return state.found.length;
  }

  function hasFoundWord(word) {
    for (var i = 0; i < state.found.length; i++) {
      if (state.found[i].word === word) {
        return true;
      }
    }
    return false;
  }

  function addFound(word, path, points) {
    if (hasFoundWord(word)) {
      return "duplicate";
    }
    state.found.push({ word: word, path: path.slice(), points: points });
    utils.claimPath(state.claimed, path);
    state.found.sort(function (a, b) {
      return a.word.localeCompare(b.word);
    });
    return "added";
  }

  function formatDisplayDate(dateKey) {
    var dt = utils.parseDateKey(dateKey);
    if (!dt) {
      return dateKey;
    }
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function renderChrome() {
    var today = utils.todayKey();
    var score = currentScore();
    var claimed = claimedCount();
    var total = cellTotal();
    var fillRatio = total ? claimed / total : 0;

    els.title.textContent = "SumSwipe";
    els.blurb.textContent =
      "Daily puzzle for " +
      formatDisplayDate(state.dateKey) +
      ". Claim all 25 cells with words (A=1…Z=26). Drag to swipe, or click letters and submit.";
    els.progress.textContent =
      claimed + "/" + total + " cells · " + score + " pts";

    els.scoreValue.textContent = String(score);
    if (els.fillValue) {
      els.fillValue.textContent = String(claimed);
    }
    if (els.fillMax) {
      els.fillMax.textContent = String(total);
    }
    if (els.fillBar) {
      els.fillBar.style.width = Math.round(fillRatio * 1000) / 10 + "%";
      els.fillBar.dataset.fill = String(claimed);
      if (claimed >= total) {
        els.fillBar.classList.add("is-complete");
      } else {
        els.fillBar.classList.remove("is-complete");
      }
    }
    els.foundCount.textContent = String(foundWordCount());

    var earliest = utils.earliestDateKey();
    els.prev.disabled = state.dateKey <= earliest;
    els.next.disabled = state.dateKey >= today;
    els.today.disabled = state.dateKey === today;
  }

  function renderFound() {
    els.foundList.innerHTML = "";
    var entries = state.found.slice().sort(function (a, b) {
      return (b.points || 0) - (a.points || 0) || a.word.localeCompare(b.word);
    });
    if (!entries.length) {
      var empty = document.createElement("li");
      empty.className = "ss-found-empty";
      empty.textContent = "No words yet — swipe a path through open cells, or click letters and hit Submit.";
      els.foundList.appendChild(empty);
      return;
    }
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var li = document.createElement("li");
      li.className = "ss-found-item";
      var w = document.createElement("span");
      w.className = "ss-found-word";
      w.textContent = entry.word;
      var pts = document.createElement("span");
      pts.className = "ss-found-pts";
      pts.textContent = "+" + (entry.points || utils.wordPoints(entry.word));
      li.appendChild(w);
      li.appendChild(pts);
      els.foundList.appendChild(li);
    }
  }

  function cellCenter(index) {
    var cell = els.grid.querySelector('[data-index="' + index + '"]');
    if (!cell) {
      return null;
    }
    var gridRect = els.grid.getBoundingClientRect();
    var r = cell.getBoundingClientRect();
    return {
      x: r.left - gridRect.left + r.width / 2,
      y: r.top - gridRect.top + r.height / 2,
    };
  }

  function drawPath() {
    var svg = els.pathSvg;
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    if (state.path.length < 2) {
      return;
    }
    var d = "";
    for (var i = 0; i < state.path.length; i++) {
      var pt = cellCenter(state.path[i]);
      if (!pt) {
        continue;
      }
      d += (i === 0 ? "M" : "L") + pt.x + " " + pt.y + " ";
    }
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d.trim());
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(38, 96, 171, 0.9)");
    path.setAttribute("stroke-width", "7");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }

  function updateLive() {
    var forward = utils.pathToWord(state.puzzle.grid, state.path);
    var resolved = utils.resolvePathWord(state.puzzle.grid, state.path);
    var scoredWord = resolved.word || forward;
    var displayWord = scoredWord || "—";
    var base = scoredWord ? utils.wordSum(scoredWord) : null;
    var factor = scoredWord ? utils.lengthFactor(scoredWord.length) : null;
    var total = scoredWord ? utils.wordPoints(scoredWord) : null;

    els.liveWord.textContent = displayWord;
    if (resolved.word && resolved.reversed && forward) {
      els.liveWord.textContent = resolved.word + " ← " + forward;
    }
    if (total == null) {
      els.liveSum.textContent = "—";
    } else if (factor && factor !== 1) {
      els.liveSum.textContent = base + " ×" + factor + " = " + total;
    } else {
      els.liveSum.textContent = String(total);
    }

    if (!forward) {
      els.liveEq.textContent =
        "Drag to swipe · click to extend · release/Submit/double-tap end";
      return;
    }

    var parts = [];
    for (var i = 0; i < forward.length; i++) {
      var ch = forward.charAt(i);
      parts.push(ch + "(" + utils.letterValue(ch) + ")");
    }
    var msg = parts.join(" + ") + " = " + utils.wordSum(forward);
    if (resolved.word && resolved.reversed) {
      msg += " → " + resolved.word;
    }
    if (factor && factor !== 1) {
      msg += " × " + factor + " = " + total;
    }
    els.liveEq.textContent = msg;
  }

  function highlightPath() {
    var cells = els.grid.querySelectorAll(".ss-cell");
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.remove("is-path", "is-path-head", "is-focused");
    }
    for (var j = 0; j < state.path.length; j++) {
      var idx = state.path[j];
      var cell = els.grid.querySelector('[data-index="' + idx + '"]');
      if (!cell) {
        continue;
      }
      cell.classList.add("is-path");
      if (j === state.path.length - 1) {
        cell.classList.add("is-path-head");
      }
    }
    var focusCell = els.grid.querySelector('[data-index="' + state.focusIndex + '"]');
    if (focusCell) {
      focusCell.classList.add("is-focused");
    }
    drawPath();
    updateLive();
  }

  function setFocusIndex(index) {
    if (!state.puzzle) {
      return;
    }
    if (index < 0 || index >= state.puzzle.grid.length) {
      return;
    }
    state.focusIndex = index;
    var cell = els.grid.querySelector('[data-index="' + index + '"]');
    if (cell && typeof cell.focus === "function") {
      cell.focus();
    }
    highlightPath();
  }

  function clearPath() {
    state.path = [];
    clearTapMemory();
    highlightPath();
  }

  function syncSvgSize() {
    var rect = els.grid.getBoundingClientRect();
    els.pathSvg.setAttribute("width", String(rect.width));
    els.pathSvg.setAttribute("height", String(rect.height));
    els.pathSvg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    drawPath();
  }

  function renderGrid() {
    var p = state.puzzle;
    els.grid.style.setProperty("--ss-size", String(p.size));
    els.grid.innerHTML = "";
    els.grid.setAttribute(
      "aria-label",
      "SumSwipe daily grid for " + state.dateKey + ". Arrow keys move, Space adds, Enter submits."
    );

    for (var i = 0; i < p.grid.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-cell";
      if (state.claimed[i]) {
        btn.classList.add("is-claimed");
      }
      btn.dataset.index = String(i);
      btn.setAttribute(
        "aria-label",
        "Letter " + p.grid[i] + ", value " + utils.letterValue(p.grid[i])
      );
      btn.tabIndex = i === state.focusIndex ? 0 : -1;
      var letter = document.createElement("span");
      letter.className = "ss-cell-letter";
      letter.textContent = p.grid[i];
      var val = document.createElement("span");
      val.className = "ss-cell-value";
      val.textContent = String(utils.letterValue(p.grid[i]));
      btn.appendChild(letter);
      btn.appendChild(val);
      btn.addEventListener("focus", function (ev) {
        var idx = parseInt(ev.currentTarget.dataset.index, 10);
        if (!isNaN(idx)) {
          state.focusIndex = idx;
          highlightPath();
        }
      });
      els.grid.appendChild(btn);
    }

    requestAnimationFrame(syncSvgSize);
    highlightPath();
  }

  function loadDay(dateKey) {
    var today = utils.todayKey();
    var earliest = utils.earliestDateKey();
    if (dateKey > today) {
      dateKey = today;
    }
    if (dateKey < earliest) {
      dateKey = earliest;
    }
    state.dateKey = dateKey;
    state.puzzle = utils.generateGrid(dateKey, utils.GRID_SIZE);
    state.validSet = {};
    for (var i = 0; i < state.puzzle.words.length; i++) {
      state.validSet[state.puzzle.words[i]] = true;
    }
    state.found = [];
    state.claimed = {};
    state.path = [];
    state.dragging = false;
    state.pointerId = null;
    state.dragMoved = false;
    state.gestureChangedPath = false;
    state.lastTapTime = 0;
    state.lastTapIndex = -1;
    state.focusIndex = 0;
    restoreProgress();
    renderChrome();
    renderGrid();
    renderFound();
    updateLive();
    var isToday = state.dateKey === utils.todayKey();
    setStatus(
      (isToday ? "Today’s grid" : "This day’s grid") +
        " · claim all " +
        cellTotal() +
        " cells."
    );
  }

  function celebrateFullFill() {
    root.classList.add("ss-celebrate");
    setTimeout(function () {
      root.classList.remove("ss-celebrate");
    }, 900);
  }

  function tryCommitPath() {
    if (
      !utils.isValidPath(state.path, state.puzzle.size) ||
      state.path.length < utils.MIN_WORD_LEN
    ) {
      clearPath();
      return;
    }

    if (utils.pathUsesClaimed(state.path, state.claimed)) {
      setStatus("That path uses cells you already claimed.", "error");
      clearPath();
      return;
    }

    var resolved = utils.resolvePathWord(state.puzzle.grid, state.path);
    var attempted = utils.pathToWord(state.puzzle.grid, state.path);

    if (!resolved.word) {
      setStatus('"' + attempted + '" isn’t a word (try the other direction too).', "error");
      clearPath();
      return;
    }

    if (!state.validSet[resolved.word]) {
      setStatus(resolved.word + " isn’t on this grid.", "error");
      clearPath();
      return;
    }

    if (hasFoundWord(resolved.word)) {
      setStatus("Already claimed with " + resolved.word + ".", "error");
      clearPath();
      return;
    }

    var pts = utils.wordPoints(resolved.word);
    addFound(resolved.word, state.path, pts);
    saveProgress();
    renderChrome();
    renderGrid();
    renderFound();
    clearPath();

    var note = resolved.reversed ? " (reverse)" : "";
    var full = claimedCount() >= cellTotal();
    if (full) {
      setStatus(
        "Board filled! " + resolved.word + " +" + pts + note + " · " + currentScore() + " pts (+15% bonus)",
        "success"
      );
      celebrateFullFill();
    } else {
      setStatus(
        resolved.word + " +" + pts + note + " · " + claimedCount() + "/" + cellTotal() + " cells",
        "success"
      );
    }
  }

  /** Prefer nearest cell center within a generous radius (helps finger gaps). */
  function indexFromPoint(clientX, clientY) {
    var gridRect = els.grid.getBoundingClientRect();
    if (
      clientX < gridRect.left - 8 ||
      clientX > gridRect.right + 8 ||
      clientY < gridRect.top - 8 ||
      clientY > gridRect.bottom + 8
    ) {
      return -1;
    }

    var cells = els.grid.querySelectorAll(".ss-cell");
    if (!cells.length) {
      return -1;
    }
    var cellRect = cells[0].getBoundingClientRect();
    var radius = Math.max(cellRect.width, cellRect.height) * 0.62;
    var best = -1;
    var bestDist = radius * radius;

    for (var i = 0; i < cells.length; i++) {
      var r = cells[i].getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dx = clientX - cx;
      var dy = clientY - cy;
      var dist = dx * dx + dy * dy;
      if (dist <= bestDist) {
        bestDist = dist;
        best = parseInt(cells[i].dataset.index, 10);
      }
    }
    return best;
  }

  var DOUBLE_TAP_MS = 600;
  var DRAG_MOVE_PX = 18;

  function extendPath(index) {
    if (index < 0 || index >= state.puzzle.grid.length) {
      return;
    }
    if (utils.isCellClaimed(state.claimed, index) && state.path.indexOf(index) === -1) {
      return;
    }
    if (state.path.length === 0) {
      if (utils.isCellClaimed(state.claimed, index)) {
        return;
      }
      state.path.push(index);
      state.focusIndex = index;
      highlightPath();
      return;
    }
    var last = state.path[state.path.length - 1];
    if (index === last) {
      return;
    }
    if (state.path.length >= 2 && index === state.path[state.path.length - 2]) {
      state.path.pop();
      state.focusIndex = state.path[state.path.length - 1];
      highlightPath();
      return;
    }
    if (!utils.areAdjacent(last, index, state.puzzle.size)) {
      return;
    }
    if (state.path.indexOf(index) !== -1) {
      return;
    }
    if (utils.isCellClaimed(state.claimed, index)) {
      return;
    }
    if (state.path.length >= utils.MAX_WORD_LEN) {
      return;
    }
    state.path.push(index);
    state.focusIndex = index;
    highlightPath();
  }

  function applyTapToPath(index) {
    var action = utils.pathTapAction(state.path, index, state.puzzle.size);
    if (action === "restart") {
      state.path = [];
      clearTapMemory();
      extendPath(index);
      return;
    }
    if (action === "noop") {
      state.focusIndex = index;
      highlightPath();
      return;
    }
    extendPath(index);
  }

  function endDrag() {
    if (!state.dragging) {
      return;
    }
    state.dragging = false;
    state.pointerId = null;
  }

  function pathEndIndex() {
    if (!state.path.length) {
      return -1;
    }
    return state.path[state.path.length - 1];
  }

  function canSubmitPath() {
    return state.path.length >= utils.MIN_WORD_LEN;
  }

  function recordEndTap(index) {
    state.lastTapTime = Date.now();
    state.lastTapIndex = index;
  }

  function clearTapMemory() {
    state.lastTapTime = 0;
    state.lastTapIndex = -1;
  }

  /** True when this pointer-down should submit via double-tap on the path end. */
  function shouldDoubleTapSubmit(index) {
    if (!canSubmitPath() || index !== pathEndIndex()) {
      return false;
    }
    return utils.isDoubleTap(
      Date.now(),
      state.lastTapTime,
      state.lastTapIndex,
      index,
      DOUBLE_TAP_MS
    );
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) {
      return;
    }
    if (state.dragging) {
      return;
    }
    var index = indexFromPoint(e.clientX, e.clientY);
    if (index < 0) {
      return;
    }
    e.preventDefault();

    // Double-tap the current end letter to submit (checked before path changes).
    if (shouldDoubleTapSubmit(index)) {
      clearTapMemory();
      tryCommitPath();
      return;
    }

    state.dragging = true;
    state.pointerId = e.pointerId;
    state.dragMoved = false;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.gestureChangedPath = false;
    state.gestureStartLen = state.path.length;
    if (els.grid.setPointerCapture) {
      try {
        els.grid.setPointerCapture(e.pointerId);
      } catch (err) {
        // ignore
      }
    }
    var before = state.path.join(",");
    applyTapToPath(index);
    if (state.path.join(",") !== before) {
      state.gestureChangedPath = true;
    }
  }

  function onPointerMove(e) {
    if (!state.dragging) {
      return;
    }
    if (state.pointerId != null && e.pointerId !== state.pointerId) {
      return;
    }
    e.preventDefault();
    var dx = e.clientX - state.dragStartX;
    var dy = e.clientY - state.dragStartY;
    if (dx * dx + dy * dy >= DRAG_MOVE_PX * DRAG_MOVE_PX) {
      state.dragMoved = true;
    }
    var index = indexFromPoint(e.clientX, e.clientY);
    if (index >= 0) {
      var before = state.path.join(",");
      extendPath(index);
      if (state.path.join(",") !== before) {
        state.gestureChangedPath = true;
      }
    }
  }

  function onPointerUp(e) {
    if (!state.dragging) {
      return;
    }
    if (state.pointerId != null && e.pointerId !== state.pointerId) {
      return;
    }
    var index = indexFromPoint(e.clientX, e.clientY);
    var dragMoved = state.dragMoved;
    var gestureChangedPath = state.gestureChangedPath;
    if (els.grid.releasePointerCapture && state.pointerId != null) {
      try {
        els.grid.releasePointerCapture(state.pointerId);
      } catch (err) {
        // ignore
      }
    }
    endDrag();

    // Swipe: release after dragging through letters submits.
    if (dragMoved && gestureChangedPath && canSubmitPath()) {
      clearTapMemory();
      tryCommitPath();
      return;
    }

    // Click-built path: remember end taps so a second tap submits.
    if (canSubmitPath() && index === pathEndIndex()) {
      recordEndTap(index);
      return;
    }

    clearTapMemory();
  }

  function onWindowPointerUp(e) {
    if (!state.dragging) {
      return;
    }
    if (state.pointerId != null && e.pointerId !== state.pointerId) {
      return;
    }
    onPointerUp(e);
  }

  els.grid.addEventListener("pointerdown", onPointerDown);
  els.grid.addEventListener("pointermove", onPointerMove);
  els.grid.addEventListener("pointerup", onPointerUp);
  els.grid.addEventListener("pointercancel", onPointerUp);
  els.grid.addEventListener("lostpointercapture", function () {
    if (state.dragging) {
      endDrag();
    }
  });
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);

  els.grid.addEventListener(
    "touchmove",
    function (e) {
      if (state.dragging) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  els.prev.addEventListener("click", function () {
    var prev = utils.shiftDateKey(state.dateKey, -1);
    var earliest = utils.earliestDateKey();
    if (prev < earliest) {
      prev = earliest;
    }
    loadDay(prev);
  });
  els.next.addEventListener("click", function () {
    var today = utils.todayKey();
    var next = utils.shiftDateKey(state.dateKey, 1);
    if (next > today) {
      next = today;
    }
    loadDay(next);
  });
  els.today.addEventListener("click", function () {
    loadDay(utils.todayKey());
  });
  els.clear.addEventListener("click", function () {
    clearPath();
    setStatus("Path cleared.");
  });
  if (els.submit) {
    els.submit.addEventListener("click", function () {
      if (!canSubmitPath()) {
        setStatus("Build a path of at least " + utils.MIN_WORD_LEN + " letters first.");
        return;
      }
      clearTapMemory();
      tryCommitPath();
    });
  }
  els.reset.addEventListener("click", function () {
    state.found = [];
    state.claimed = {};
    saveProgress();
    clearPath();
    renderChrome();
    renderGrid();
    renderFound();
    setStatus("Day’s progress cleared.");
  });

  function moveFocus(dr, dc) {
    var size = state.puzzle.size;
    var pos = utils.indexToRowCol(state.focusIndex, size);
    var row = Math.max(0, Math.min(size - 1, pos.row + dr));
    var col = Math.max(0, Math.min(size - 1, pos.col + dc));
    setFocusIndex(utils.rowColToIndex(row, col, size));
    // Keep roving tabindex on the focused cell.
    var cells = els.grid.querySelectorAll(".ss-cell");
    for (var i = 0; i < cells.length; i++) {
      cells[i].tabIndex = -1;
    }
    var focusCell = els.grid.querySelector('[data-index="' + state.focusIndex + '"]');
    if (focusCell) {
      focusCell.tabIndex = 0;
      focusCell.focus();
    }
  }

  els.grid.addEventListener("keydown", function (e) {
    if (state.dragging) {
      return;
    }
    var key = e.key;
    if (key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1, 0);
    } else if (key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1, 0);
    } else if (key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(0, -1);
    } else if (key === "ArrowRight") {
      e.preventDefault();
      moveFocus(0, 1);
    } else if (key === " " || key === "Spacebar") {
      e.preventDefault();
      extendPath(state.focusIndex);
    } else if (key === "Enter") {
      e.preventDefault();
      if (state.path.length >= utils.MIN_WORD_LEN) {
        tryCommitPath();
      } else {
        extendPath(state.focusIndex);
      }
    } else if (key === "Backspace") {
      e.preventDefault();
      if (state.path.length) {
        state.path.pop();
        state.lastTapTime = 0;
        state.lastTapIndex = -1;
        var focus = utils.focusAfterBackspace(state.path);
        if (focus == null) {
          highlightPath();
        } else {
          setFocusIndex(focus);
        }
      }
    } else if (key === "Escape") {
      e.preventDefault();
      clearPath();
      setStatus("Path cleared.");
    }
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      syncSvgSize();
      highlightPath();
    }, 100);
  });

  loadDay(utils.todayKey());
})();
