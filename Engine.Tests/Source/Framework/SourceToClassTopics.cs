﻿/* 
 * Class: GregValure.NaturalDocs.Engine.Tests.Framework.SourceToClassTopics
 * ____________________________________________________________________________
 * 
 * A base class for automated tests where sample source files are run through Natural Docs normally and then the 
 * <Topics> are extracted by class and combined.  The portions of those <Topics> being tested are saved to files 
 * and compared to other files containing the  expected result.
 * 
 *	 The benefit of this approach is that you never have to hand code the output.  You can run the tests without
 *	 an expected output file, look over the actual output file, and if it's acceptable rename it to become the
 *	 expected output file.
 * 
 * Usage:
 * 
 *		- Derive a class that has the [TestFixture] attribute.
 *		- Create a function with the [Test] attribute that calls <TestFolder()>, pointing it to the input files.
 *		- Define <OutputOf()> to convert some facet of the <Topic> list to string output.
 *		- Since the input files and output files will not match 1:1, the generated result files will be similar to
 *		   [Class Name] - Actual Output.txt.
 *		- If it matches the contents of the file "[Class Name] - Expected Output.txt", the test will pass.  If it doesn't,
 *		  that file doesn't exist, or an exception was thrown, the test will fail.
 *		
 */

// This file is part of Natural Docs, which is Copyright © 2003-2012 Greg Valure.
// Natural Docs is licensed under version 3 of the GNU Affero General Public License (AGPL)
// Refer to License.txt for the complete details


using System;
using System.Collections.Generic;
using System.Text;
using NUnit.Framework;
using GregValure.NaturalDocs.Engine.Collections;
using GregValure.NaturalDocs.Engine.Symbols;
using GregValure.NaturalDocs.Engine.Topics;


namespace GregValure.NaturalDocs.Engine.Tests.Framework
	{
	public abstract class SourceToClassTopics
		{

		// Group: Functions
		// __________________________________________________________________________

		/* Constructor: SourceToClassTopics
		 */
		public SourceToClassTopics ()
			{
			}


		/* Function: OutputOf
		 * 
		 * Override this function to generate the output for the passed <Topics>.  The output should be whatever you're
		 * testing, so if you want to test prototype detection, return the prototype.  You have to account for the possibility
		 * of there being more than one topic in an input file, or none at all.
		 * 
		 * You do not need to worry about catching exceptions unless the test is supposed to trigger them.  Uncaught exceptions
		 * will be handled automatically and cause the test to fail.  If the exception was intended as part of correct operation then 
		 * you must catch it to prevent this.
		 * 
		 * This function should not return null or an empty string as part of a successful test.  Doing so will cause the test to fail.
		 * If a test is supposed to generated no output, return a string such as "test successful" instead.
		 */
		public abstract string OutputOf (IList<Topic> topics);


		/* Function: TestFolder
		 * 
		 * Tests all the input files contained in this folder.
		 * 
		 * If the test data folder is relative it will take the executing assembly path, skip up until it finds "Components", move 
		 * into the "EngineTests\Test Data" subfolder, and then make the path relative to that.  This is because it assumes all 
		 * the Natural Docs components will be subfolders of a shared Components folder, and Visual Studio or any other IDE
		 * is running an executable found inside a component's subfolder.
		 */
		public void TestFolder (Path testFolder, Path projectConfigFolder = default(Path))
			{
			TestList allTests = new TestList();
			StringSet expectedOutputFiles = new StringSet(false, false);
			TestEngine.Start(testFolder, projectConfigFolder);

			try
				{
				TestEngine.Run();


				// Iterate through classes to build output files.

				using (Engine.CodeDB.Accessor accessor = Engine.Instance.CodeDB.GetAccessor())
					{
					// Class IDs should be assigned sequentially.  It's not an ideal way to do this though.
					int classID = 1;
					accessor.GetReadOnlyLock();

					try
						{
						for (;;)
							{
							Engine.Output.Builders.Components.HTMLTopicPages.Class classPage = 
								new Output.Builders.Components.HTMLTopicPages.Class(TestEngine.HTMLBuilder, classID);

							List<Topic> classTopics = classPage.GetTopics(accessor, Delegates.NeverCancel);

							if (classTopics == null || classTopics.Count == 0)
								{  break;  }

							string testName = classTopics[0].ClassString.Symbol.FormatWithSeparator(".");
							Path outputFilePath = Test.ActualOutputFileOf(testName, TestEngine.InputFolder);

							Test test = Test.FromActualOutputFile(outputFilePath);
							expectedOutputFiles.Add(test.ExpectedOutputFile);

							try
								{
								test.SetActualOutput( OutputOf(classTopics) );
								}
							catch (Exception e)
								{  test.TestException = e;  }

							test.Run();
							allTests.Add(test);

							classID++;
							}
						}
					finally
						{  accessor.ReleaseLock();  }
					}


				// Now search for any expected output files that didn't have corresponding actual output files.

				string[] files = System.IO.Directory.GetFiles(TestEngine.InputFolder);

				foreach (string file in files)
					{
					if (Test.IsExpectedOutputFile(file) && expectedOutputFiles.Contains(file) == false)
						{
						Test test = Test.FromExpectedOutputFile(file);
						test.Run();
						allTests.Add(test);

						expectedOutputFiles.Add(file);
						}
					}
				}

			finally
				{  TestEngine.Dispose();  }


			if (allTests.Count == 0)
				{  Assert.Fail("There were no tests found in " + TestEngine.InputFolder);  }
			else if (allTests.Passed == false)
				{  Assert.Fail(allTests.BuildFailureMessage());  }
			}

		}
	}