// Copyright 2014 The Oppia Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

oppia.directive('oppiaInteractiveLogicProof', [
  'oppiaHtmlEscaper', function(oppiaHtmlEscaper) {

    return {
      restrict: 'E',
      scope: {},
      templateUrl: 'interaction/LogicProof',
      controller: ['$scope', '$attrs', '$modal', '$element', 'logicProofRulesService',
          function($scope, $attrs, $modal, $element, logicProofRulesService) {
        $scope.localQuestionData = oppiaHtmlEscaper.escapedJsonToObj(
          $attrs.questionWithValue);

        // This is the information about how to mark a question (e.g. the
        // permited line templates) that is stored in defaultData.js within
        // the dependencies.
        $scope.questionData = angular.copy(LOGIC_PROOF_DEFAULT_QUESTION_DATA);

        $scope.questionData.assumptions = $scope.localQuestionData.assumptions;
        $scope.questionData.results = $scope.localQuestionData.results;

        // Deduce the new operators, as in logicProofTeacher.buildQuestion(),
        // since these are not currently stored separately for each question.
        $scope.expressions = [];
        $scope.topTypes = [];
        for (var i = 0; i < $scope.questionData.assumptions.length; i++) {
          $scope.expressions.push($scope.questionData.assumptions[i]);
          $scope.topTypes.push('boolean');
        }
        $scope.expressions.push($scope.questionData.results[0]);
        $scope.topTypes.push('boolean');
        $scope.typing = logicProofShared.assignTypesToExpressionArray(
          $scope.expressions, $scope.topTypes,
          logicProofData.BASE_STUDENT_LANGUAGE,
          ['variable', 'constant', 'prefix_function']
        );
        $scope.questionData.language.operators = $scope.typing[0].operators;

        $scope.displayExpression = function(expression) {
          return logicProofShared.displayExpression(
            expression, $scope.questionData.language.operators);
        };

        $scope.displayExpressionArray = function(array) {
          return logicProofShared.displayExpressionArray(
            array, $scope.questionData.language.operators);
        };

        if ($scope.questionData.assumptions.length <= 1) {
          $scope.assumptionsString = $scope.displayExpressionArray(
            $scope.questionData.assumptions);
        } else {
          $scope.assumptionsString = $scope.displayExpressionArray(
            $scope.questionData.assumptions.slice(
              0, $scope.questionData.assumptions.length - 1)
            ) + ' and ' + $scope.displayExpression(
              $scope.questionData.assumptions[
                $scope.questionData.assumptions.length - 1]);
        }
        $scope.targetString = $scope.displayExpression(
          $scope.questionData.results[0]);
        $scope.questionString = ($scope.assumptionsString === '') ?
            'Prove ' + $scope.targetString + '.':
            'Assuming ' + (
              $scope.assumptionsString + '; prove ' + $scope.targetString +
              '.');

        $scope.questionInstance = logicProofStudent.buildInstance(
          $scope.questionData);
        // Denotes whether messages are in response to a submission, in which
        // case they persist for longer.
        $scope.messageIsSticky = false;

        // NOTE: for information on integrating angular and code-mirror see
        // http://github.com/angular-ui/ui-codemirror
        $scope.codeEditor = function(editor) {
          editor.setValue($scope.localQuestionData.default_proof_string)
          $scope.proofString = editor.getValue();
          var cursorPosition = editor.doc.getCursor();

          editor.setOption('lineNumbers', true);
          editor.setOption('lineWrapping', true);

          // NOTE: this is necessary to avoid the textarea being greyed-out. See
          // http://stackoverflow.com/questions/8349571 for discussion.
          setTimeout(function() {
            editor.refresh();
          }, 500);

          // NOTE: we must use beforeChange rather than change here to avoid an
          // infinite loop (which code-mirror will not catch).
          editor.on('beforeChange', function(instance, change) {
            var convertedText = logicProofConversion.convertToLogicCharacters(
              change.text.join('\n'));
            if (convertedText !== change.text.join('\n')) {
              // We update using the converted text, then cancel its being
              // overwritten by the original text.
              editor.doc.replaceRange(convertedText, change.from, change.to);
              change.cancel();
            }
          });

          editor.on('cursorActivity', function() {
            if (editor.doc.getCursor().line !== cursorPosition.line) {
              $scope.checkForBasicErrors();
              cursorPosition = editor.doc.getCursor();
            }
          })

          // NOTE: we use change rather than beforeChange here so that checking
          // for mistakes is done with respect to the updated text.
          editor.on('change', function(instance, change) {
            $scope.proofString = editor.getValue();
            // We update the message only if the user has added or removed a
            // line break, so that it remains while they work on a single line.
            if (change.text.length > 1 || change.removed.length > 1) {
              $scope.checkForBasicErrors();
            }
          });

          $scope.editor = editor;
        };

        $scope.checkForBasicErrors = function() {
          if (!$scope.messageIsSticky) {
            $scope.clearMessage();
          }
          try {
            logicProofStudent.validateProof(
              $scope.proofString, $scope.questionInstance);
          } catch(err) {
            $scope.clearMessage();
            $scope.showMessage(err.message, err.line);
            $scope.messageIsSticky = false;
          }
          // NOTE: this line is necessary to force angular to refresh the
          // displayed mistakeMessage.
          $scope.$apply();
        };

        $scope.clearMessage = function() {
          if ($scope.mistakeMark) {
            $scope.mistakeMark.clear();
          }
          $scope.mistakeMessage = '';
        }

        $scope.showMessage = function(message, lineNum) {
          $scope.mistakeMessage = $scope.renderMessage(message, lineNum);
          $scope.mistakeMark = $scope.editor.doc.markText(
            {line: lineNum, ch: 0},
            {line: lineNum, ch: 100},
            {className: 'logic-proof-erroneous-line'});
        };

        $scope.renderMessage = function(message, lineNum) {
          return 'line ' + (lineNum + 1) + ': ' + message;
        };

        $scope.displayProof = function(proofString, errorLineNum) {
          var proofLines = proofString.split('\n');
          var numberedLines = [];
          for (var i = 0; i < proofLines.length; i++) {
            numberedLines.push((i + 1) + '  ' + proofLines[i]);
          }
          // We split incorrect proofs into three parts so that response.html
          // can make the invalid line bold.
          return (errorLineNum === undefined) ?
            [numberedLines.join('\n')] :
            [
              numberedLines.slice(0, errorLineNum).join('\n'),
              numberedLines[errorLineNum],
              numberedLines.slice(
                errorLineNum + 1, numberedLines.length).join('\n')
            ];
        };

        // NOTE: proof_num_lines, displayed_question and displayed_proof are
        // only computed here because response.html needs them and does not have
        // its own javascript.
        $scope.submitProof = function() {
          $scope.clearMessage();
          var submission = {
            assumptions_string: $scope.assumptionsString,
            target_string: $scope.targetString,
            proof_string: $scope.proofString,
            proof_num_lines: $scope.proofString.split('\n').length,
            displayed_question: $scope.questionString
          };
          try {
            var proof = logicProofStudent.buildProof(
              $scope.proofString, $scope.questionInstance);
            logicProofStudent.checkProof(proof, $scope.questionInstance);
            submission.correct = true;
          } catch (err) {
            submission.correct = false;
            submission.error_category = err.category;
            submission.error_code = err.code;
            submission.error_message = err.message;
            submission.error_line_number = err.line;
            submission.displayed_message =
              $scope.renderMessage(err.message, err.line);
            submission.displayed_proof =
              $scope.displayProof($scope.proofString, err.line);

            $scope.showMessage(err.message, err.line);
            $scope.messageIsSticky = true;
          }
          if (submission.correct) {
            submission.displayed_message = '';
            submission.displayed_proof = $scope.displayProof(
              $scope.proofString);
          }
          $scope.$parent.submitAnswer(submission, logicProofRulesService);
        };

        $scope.showHelp = function() {
          $modal.open({
            templateUrl: 'modals/logicProofHelp',
            backdrop: true,
            controller: ['$scope', '$modalInstance',
              function($scope, $modalInstance) {
                $scope.close = function() {
                  $modalInstance.close();
                };
              }
            ]
          }).result.then(function() {});
        };
      }]
    };
  }
]);

oppia.directive('oppiaResponseLogicProof', [
  'oppiaHtmlEscaper', function(oppiaHtmlEscaper) {
    return {
      restrict: 'E',
      scope: {},
      templateUrl: 'response/LogicProof',
      controller: ['$scope', '$attrs', function($scope, $attrs) {
        $scope.answer = oppiaHtmlEscaper.escapedJsonToObj($attrs.answer);
      }]
    };
  }
]);

oppia.directive('oppiaShortResponseLogicProof', [
  'oppiaHtmlEscaper', function(oppiaHtmlEscaper) {
    return {
      restrict: 'E',
      scope: {},
      templateUrl: 'shortResponse/LogicProof',
      controller: ['$scope', '$attrs', function($scope, $attrs) {
        $scope.answer = oppiaHtmlEscaper.escapedJsonToObj($attrs.answer);
      }]
    };
  }
]);

oppia.factory('logicProofRulesService', [function() {
  return {
    Correct: function(answer, inputs) {
      return answer.correct;
    },
    NotCorrect: function(answer, inputs) {
      return !answer.correct;
    },
    NotCorrectByCategory: function(answer, inputs) {
      return !answer.correct && answer.error_category === inputs.c;
    }
  };
}]);
