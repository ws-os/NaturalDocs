﻿/*
	Include in output:

	This file is part of Natural Docs, which is Copyright © 2003-2011 Greg Valure.
	Natural Docs is licensed under version 3 of the GNU Affero General Public
	License (AGPL).  Refer to License.txt for the complete details.

	This file may be distributed with documentation files generated by Natural Docs.
	Such documentation is not covered by Natural Docs' copyright and licensing,
	and may have its own copyright and distribution terms as decided by its author.

	
	Substitutions:

		Entry Types:

		`RootFolder = 0
		`LocalFolder = 1
		`DynamicFolder = 2
		`ExplicitFile = 3
		`ImplicitFile = 4

		Member Indexes:

		`Type = 0
		`ID = 1
		`Name = 1
		`HashPath = 2
		`Members = 3

		Constants:

		`MaxFileMenuSections = 3
			This is the ideal, since it may need to be larger if there are a lot of levels in use.
			xxx make 10 in full release
*/


/* Class: NDMenu
	___________________________________________________________________________

	Loading Process:

		- The displayed navigation path is in <currentFileMenuPath>.  When a file or folder is clicked, it creates a new path
		  in <newFileMenuPath> and calls <Update()>.  
		
		- If all the data needed exists in <fileMenuSections> a new menu is generated, <newFileMenuPath> replaces 
		  <currentFileMenuPath>, and <newFileMenuPath> becomes undefined.

		- If some of the data is missing <Update()> displays what it can, requests to load additional menu sections, and returns.
		  When the data comes back via <FileMenuSectionLoaded()> that function will call <Update()> again.  <Update()> will either 
		  finish the update, request more parts of the menu, or just wait for previously requested data to come in.

		- This system allows the user to click a different file before everything finishes loading.  <newFileMenuPath> will be replaced
		  and <Update()> called again.  If the previous click's data comes back after the new navigation has been completed, 
		  <Update()> won't do anything because it cleared <newFileMenuPath()> already.  If the previous click's data comes back
		  but isn't relevant to the new click which is still loading, <Update()> will just rebuild the partial menu with what it has to no
		  detrimental effect.

	Caching:

		The class stores loaded sections in <fileMenuSections>, hanging on to them until it grows to `MaxFileMenuSections, at which
		point unused entries may be pruned.  The array may grow larger than `MaxFileMenuSections if required to display everything.

		Which entries are in use is tracked by the <firstUnusedFileMenuSection> index.  This is reset when <Update()> starts,
		and every call to <GetFileMenuSection()> rearranges the array and advances it so that it serves as a dividing line.  If both
		<currentFileMenuPath> and <newFileMenuPath> (if defined) are walked start to finish, everything in use will be in indexes 
		below <firstUnusedFileMenuSection>.

		The array is rearranged so that it gets put in MRU order.  When the array grows too large unused entries can be plucked off the 
		back end and the least recently used ones will go first.

		There's another trick to it though.  When <GetFileMenuSection()> returns an entry that was past <firstUnusedFileMenuSection>,
		it doesn't move it to the head of the array, it moves it to the back of the used list.  Why?  Because the paths are walked from
		root to leaf, meaning if you had path A > B > C > D and you just moved entries to the head, they would end up in the cache in 
		this order:

		> [ D, C, B, A ]

		So then let's say you navigated from that to A > B > C2 > D2.  The cache now looks like this, with | representing the 
		used/unused divider:

		> [ D2, C2, B, A | D, C ]

		C would get ejected from the cache before D, but since D is below C in the hierarchy its presence in the cache is not especially
		useful.  So instead we move entries to the end of the used list, which keeps them in their proper order.  Going to A > B > C > D 
		results in this cache:

		> [ A, B, C, D ]

		and then navigating to A > B > C2 > D2 results in this cache:

		> [ A, B, C2, D2 | C, D ]

		D would get ejected before C.  We now have a MRU ordering that also implicitly favors higher hierarchy entries instead of lower
		ones which aren't that valuable without their parents.

*/
var NDMenu = new function ()
	{ 

	// Group: Functions
	// ________________________________________________________________________


	/* Function: Start
	*/
	this.Start = function ()
		{
		this.currentFileMenuPath = new NDMenu_FileMenuOffsetPath();
		// this.newFileMenuPath = undefined;

		this.fileMenuSections = [ ];
		this.firstUnusedFileMenuSection = 0;

		this.firstUpdate = true;
		};


	/* Function: GoToFileOffsets
		Changes the current page in the file menu to the passed array of offsets, which should be in the format used by
		<NDMenu_FileMenuOffsetPath>.
	*/
	this.GoToFileOffsets = function (offsets)
		{
		this.newFileMenuPath = new NDMenu_FileMenuOffsetPath(offsets);
		this.Update();
		};


	/* Function: GoToFileHashPath
		Changes the current page in the file menu to the passed hash string, such as "File2:folder/folder/file.cs".
	*/
	this.GoToFileHashPath = function (hashPath)
		{
		this.newFileMenuPath = new NDMenu_FileMenuHashPath(hashPath);
		this.Update();
		};


	/* Function: Update
		Generates the HTML for the menu.
	*/
	this.Update = function ()
		{
		if (this.firstUpdate == false && this.newFileMenuPath == undefined)
			{  return;  }

		// Reset.  Calls to GetFileMenuSection() made while rebuilding the menu will recalculate this.
		this.firstUnusedFileMenuSection = 0;

		var htmlMenu = document.createElement("div");
		htmlMenu.id = "MContent";

		var result = this.BuildEntries(htmlMenu);
		this.currentFileMenuPath.path = result.newPath;

		if (!result.completed)
			{
			var htmlEntry = document.createElement("div");
			htmlEntry.className = "MLoadingNotice";
			htmlMenu.appendChild(htmlEntry);
			}

		var oldMenuContent = document.getElementById("MContent");
		oldMenuContent.parentNode.replaceChild(htmlMenu, oldMenuContent);

		if (result.completed)
			{
			this.newFileMenuPath = undefined;
			this.CleanUpFileMenuSections();
			this.firstUpdate = false;
			}
		else if (result.needToLoad != undefined)
			{  this.LoadFileMenuSection(result.needToLoad);  }
		};

	
	/* Function: BuildEntries
		Generates the HTML menu entries and appends them to the passed element.  Works from <newFileMenuPath> if
		defined, otherwise <currentFileMenuPath>.  Returns an object with the following members:

		completed - Bool.  Whether it was able to build the complete path in <newFileMenuPath> as opposed to just
						  part.
		needToLoad - The ID of the menu section that needs to be loaded, or undefined if none.
		newPath - An array of offsets representing the new path, or at least as much as was generated.
	*/
	this.BuildEntries = function (htmlMenu)
		{
		var result = 
			{ 
			completed: false,
			// needToLoad: undefined,
			newPath: [ ]
			};

		var iterator = (this.newFileMenuPath != undefined ? this.newFileMenuPath.GetIterator() 
																			: this.currentFileMenuPath.GetIterator());
		var navigationType;


		// Generate the list of folders up to and including the selected one.

		for (;;)
			{	
			navigationType = iterator.NavigationType();

			if (navigationType == `Nav_RootFolder)
				{  
				var htmlEntry = document.createElement("a");
				htmlEntry.className = "MEntry MFolder Parent Root";
				htmlEntry.setAttribute("href", "javascript:NDMenu.GoToFileOffsets([])");

				var name = document.createTextNode(`{HTML.RootFolderName});
				htmlEntry.appendChild(name);

				htmlMenu.appendChild(htmlEntry);
				iterator.Next();  
				}

			else if (navigationType == `Nav_SelectedRootFolder)
				{  
				var htmlEntry = document.createElement("div");
				htmlEntry.className = "MEntry MFolder Parent Root Selected";

				var name = document.createTextNode(`{HTML.RootFolderName});
				htmlEntry.appendChild(name);

				htmlMenu.appendChild(htmlEntry);
				break;  
				}
			
			else if (navigationType == `Nav_ParentFolder || navigationType == `Nav_SelectedParentFolder)
				{
				result.newPath.push(iterator.offsetFromParent);

				var name;

				// If there's multiple names, create all but the last as empty parent folders

				if (typeof(iterator.currentEntry[`Name]) == "object")
					{
					for (var i = 0; i < iterator.currentEntry[`Name].length - 1; i++)
						{
						var htmlEntry = document.createElement("div");
						htmlEntry.className = "MEntry MFolder Parent Empty";
						htmlEntry.innerHTML = iterator.currentEntry[`Name][i];

						htmlMenu.appendChild(htmlEntry);
						}

					name = iterator.currentEntry[`Name][ iterator.currentEntry[`Name].length - 1 ];
					}
				else
					{  name = iterator.currentEntry[`Name];  }

				if (navigationType == `Nav_SelectedParentFolder)
					{
					var htmlEntry = document.createElement("div");
					htmlEntry.className = "MEntry MFolder Selected";
					htmlEntry.innerHTML = name;

					htmlMenu.appendChild(htmlEntry);
					break;
					}
				else
					{
					var htmlEntry = document.createElement("a");
					htmlEntry.className = "MEntry MFolder Parent";
					htmlEntry.setAttribute("href", "javascript:NDMenu.GoToFileOffsets([" + result.newPath.join(",") + "])");
					htmlEntry.innerHTML = name;

					htmlMenu.appendChild(htmlEntry);
					iterator.Next();
					}
				}

			else if (navigationType == `Nav_NeedToLoad)
				{  
				result.needToLoad = iterator.needToLoad;  
				return result;
				}

			else
				{  throw "Unexpected navigation type " + navigationType;  }
			}


		// Generate the list of files in the selected folder

		var selectedFolder = iterator.currentEntry;

		if (selectedFolder[`Type] == `DynamicFolder)
			{
			var membersID = selectedFolder[`Members];
			selectedFolder = this.GetFileMenuSection(membersID);  

			if (selectedFolder == undefined)
				{  
				result.needToLoad = membersID;
				return result;
				}
			}
		
		var selectedFileIndex = -1;

		if (iterator.Next())
			{  selectedFileIndex = iterator.offsetFromParent;  }

		for (var i = 0; i < selectedFolder[`Members].length; i++)
			{
			var member = selectedFolder[`Members][i];

			if (member[`Type] == `ImplicitFile || member[`Type] == `ExplicitFile)
				{
				if (i == selectedFileIndex)
					{
					var htmlEntry = document.createElement("div");
					htmlEntry.className = "MEntry MFile Selected";
					htmlEntry.innerHTML = member[`Name];

					htmlMenu.appendChild(htmlEntry);
					}
				else
					{
					var htmlEntry = document.createElement("a");
					htmlEntry.className = "MEntry MFile";
					htmlEntry.setAttribute("href", "#" + selectedFolder[`HashPath] + member[`Name]);
					htmlEntry.innerHTML = member[`Name];

					htmlMenu.appendChild(htmlEntry);
					}
				}
			else  // `InlineFolder, `DynamicFolder.  `RootFolder won't be in a member list.
				{
				var name;
				
				if (typeof(member[`Name]) == "object")
					{  name = member[`Name][0];  }
				else
					{  name = member[`Name];  }

				var targetPath = (result.newPath.length == 0 ? i : result.newPath.join(",") + "," + i);

				var htmlEntry = document.createElement("a");
				htmlEntry.className = "MEntry MFolder Child";
				htmlEntry.setAttribute("href", "javascript:NDMenu.GoToFileOffsets([" + targetPath + "])");
				htmlEntry.innerHTML = name;

				htmlMenu.appendChild(htmlEntry);
				}
			}

		result.completed = true;
		return result;
		};

	

	// Group: Support Functions
	// ________________________________________________________________________


	/* Function: GetFileMenuSection
		Returns the file root folder with the passed number, or undefined if it isn't loaded yet.
	*/
	this.GetFileMenuSection = function (id)
		{
		for (var i = 0; i < this.fileMenuSections.length; i++)
			{
			if (this.fileMenuSections[i].ID == id)
				{
				var section = this.fileMenuSections[i];

				// Move to the end of the used sections list.  It doesn't matter if it's ready.
				if (i >= this.firstUnusedFileMenuSection)
					{
					if (i > this.firstUnusedFileMenuSection)
						{
						this.fileMenuSections.splice(i, 1);
						this.fileMenuSections.splice(this.firstUnusedFileMenuSection, 0, section);
						}

					this.firstUnusedFileMenuSection++;
					}

				if (section.Ready == true)
					{  return section.RootFolder;  }
				else
					{  return undefined;  }
				}
			}

		return undefined;
		};


	/* Function: LoadFileMenuSection
		Starts loading the file root folder with the passed ID if it isn't already loaded or in the process of loading.
	*/
	this.LoadFileMenuSection = function (id)
		{
		for (var i = 0; i < this.fileMenuSections.length; i++)
			{
			if (this.fileMenuSections[i].ID == id)
				{  
				// If it has an entry, it's either already loaded or in the process of loading.
				return;
				}
			}

		// If we're here, there was no entry for it.
		this.fileMenuSections.push({
			ID: id,
			RootFolder: undefined,
			Ready: false
			});

		var script = document.createElement("script");
		script.src = "menu/files" + (id == 1 ? "" : id) + ".js";
		script.type = "text/javascript";
		script.id = "NDFileMenuLoader" + id;

		document.getElementsByTagName("head")[0].appendChild(script);
		};


	/* Function: FileMenuSectionLoaded
		Called by the menu data file when it has finished loading, passing its contents as a parameter.
	*/
	this.FileMenuSectionLoaded = function (id, rootFolder)
		{
		for (var i = 0; i < this.fileMenuSections.length; i++)
			{
			if (this.fileMenuSections[i].ID == id)
				{
				this.fileMenuSections[i].RootFolder = rootFolder;
				this.fileMenuSections[i].Ready = true;
				break;
				}
			}

//		this.Update();
		setTimeout("NDMenu.Update()", 1500);  // xxx delay all loads
		};


	/* Function: CleanUpFileMenuSections
		Goes through <fileMenuSections> and if there's more than `MaxFileMenuSections, removes the least recently accessed
		entries that aren't being used.
	*/
	this.CleanUpFileMenuSections = function ()
		{
		if (this.fileMenuSections.length > `MaxFileMenuSections)
			{
			var head = document.getElementsByTagName("head")[0];

			for (var i = this.fileMenuSections.length - 1; 
				  i >= this.firstUnusedFileMenuSection && this.fileMenuSections.length > `MaxFileMenuSections; 
				  i--)
				{
				// We don't want to remove an entry if data's being loaded for it.  The event handler could reasonably expect it 
				// to exist.
				if (this.fileMenuSections[i].Ready == false)
					{  break;  }

				// Remove the loader tag too so it can be recreated if we ever need this section again.
				head.removeChild(document.getElementById("NDFileMenuLoader" + this.fileMenuSections[i].ID));

				this.fileMenuSections.pop();
				}
			}
		};


	
	// Group: Properties
	// ________________________________________________________________________


	/* Property: currentFileMenuPath
		A <NDMenu_FileMenuOffsetPath> that forms the navigation path from the root folder to the selected 
		folder or file, if any.  If <newFileMenuPath> is undefined, this is the full path.  If <newFileMenuPath> has a
		value, this is the part of it that is displayed so far, as it may only be able to show part if it is not completely 
		loaded yet.  This may also be undefined if nothing has been displayed yet.
	*/

	/* var: newFileMenuPath
		Same as <currentFileMenuPath>, except this is the one we're trying to go to.  If this is undefined,
		we're not currently trying to navigate.
	*/



	// Group: Variables
	// ________________________________________________________________________


	/* var: fileMenuSections
		An array of <MenuSection> objects that have been loaded for the file menu or are in the process of being
		loaded.  The array is ordered from the most recently accessed to the least.
	*/

	/* var: firstUnusedFileMenuSection
		An index into <fileMenuSections> of the first entry that was not accessed via <GetFileMenuSection()> in the
		last call to <Update()>.
	*/

	/* var: firstUpdate
		Whether this is the first time the menu was ever updated.
	*/

	};






/* Class: NDMenu_MenuSection
	___________________________________________________________________________

	An object representing part of the menu structure.

		var: ID
		The root folder ID number.

		var: RootFolder
		A reference to the root folder entry itself.

		var: Ready
		True if the data has been loaded and is ready to use.  False if the data has been
		requested but is not ready yet.  If the data has not been requested it simply would
		not have a MenuSection object for it.

*/


/* Class: NDMenu_FileMenuOffsetPath
	___________________________________________________________________________

	A path through <NDMenu's> hierarchy using array offsets, which is more efficient than using folder names.
	This has the same interface as <NDMenu_FileMenuHashPath> so they can be used interchangeably.

	You can pass an array of file offsets to the constructor, or leave it undefined to refer to the root folder.

*/
function NDMenu_FileMenuOffsetPath (offsets)
	{

	// Group: Functions
	// ________________________________________________________________________

	/* Function: GetIterator
		Creates and returns a new <iterator: NDMenu_FileMenuOffsetPath_Iterator> positioned at the beginning of the path.
	*/
	this.GetIterator = function ()
		{
		return new NDMenu_FileMenuOffsetPath_Iterator(this);
		};


	// Group: Properties
	// ________________________________________________________________________

	/* Property: path
		An array of offsets.  An empty array means the root folder is selected.  A first entry would be the index of the root folder 
		member selected, and further entries would be indexes into subfolders.  If the last entry points to a folder, it means that 
		folder is selected but not a file within it.  If it points to a file, it means that file is selected.
	*/
	if (offsets == undefined)
		{  this.path = [ ];  }
	else
		{  this.path = offsets;  }

	};


/* Class: NDMenu_FileMenuOffsetPath_Iterator
	___________________________________________________________________________

	A class that can walk through <NDMenu_FileMenuOffsetPath>.  This has the same interface as 
	<NDMenu_FileMenuHashPath_Iterator> so they can be used interchangeably provided they're with their appropriate
	path types.

	Limitations:

		- The iterator can only walk forward.  Walking backwards wasn't needed when it was written so it doesn't exist.
		- The iterator must be recreated when another section of the menu is loaded.  An iterator created before the load is not
		   guaranteed to notice the new data.

*/
function NDMenu_FileMenuOffsetPath_Iterator (pathObject)
	{

	// Group: Functions
	// ________________________________________________________________________


	/* Function: Next
		Moves the iterator forward one place in the path, returning whether it's still in bounds.
	*/
	this.Next = function ()
		{
		// If we're past the end of the path...
		if (this.nextIndex > this.pathObject.path.length)
			{
			this.nextIndex++;
			this.currentEntry = undefined;
			this.offsetFromParent = -1;
			}

		// If we're in the path but past what's loaded...
		else if (this.currentEntry == undefined)
			{
			this.offsetFromParent = this.pathObject.path[this.nextIndex];
			this.nextIndex++;
			}

		// If we're moving into a folder with local members...
		else if (this.currentEntry[`Type] == `LocalFolder ||
				  this.currentEntry[`Type] == `RootFolder)
			{
			this.offsetFromParent = this.pathObject.path[this.nextIndex];
			this.currentEntry = this.currentEntry[`Members][this.offsetFromParent];
			this.nextIndex++;
			}

		// If we're moving into a folder with dynamic members...
		else if (this.currentEntry[`Type] == `DynamicFolder)
			{
			this.offsetFromParent = this.pathObject.path[this.nextIndex];

			var membersID = this.currentEntry[`Members];
			this.currentEntry = NDMenu.GetFileMenuSection(membersID);

			if (this.currentEntry == undefined)
				{  this.needToLoad = membersID;  }
			else
				{  this.currentEntry = this.currentEntry[`Members][this.offsetFromParent];  }

			this.nextIndex++;
			}

		// If we're on a file entry...
		else
			{
			// ...jump to the end of the path.  In most cases this will be the same as nextIndex++, but on the off chance
			// that we have an invalid path that extends beyond the file, just ignore the extra.
			this.nextIndex = this.pathObject.path.length + 1;
			this.currentEntry = undefined;
			this.offsetFromParent = -1;
			}

		return (this.nextIndex <= this.pathObject.path.length);
		};


	/* Function: NavigationType
		Returns the type of navigation entry the current position represents, which is different from currentEntry[`Type].
		It will return one of these values:

		`Nav_RootFolder - The topmost root folder.
		`Nav_SelectedRootFolder - The topmost root folder which is selected.
		`Nav_ParentFolder - A parent folder, but above the one that's selected.
		`Nav_SelectedParentFolder - The parent folder which is selected.
		`Nav_SelectedFile - The file which is selected.
		`Nav_NeedToLoad - This section of the menu hasn't been loaded yet.  The section to load will be stored in <needToLoad>.
		`Nav_OutOfBounds - The iterator is past the end of the path.
	*/
	this.NavigationType = function ()
		{
		/* Substitutions:
			`Nav_RootFolder = 0
			`Nav_SelectedRootFolder = 1
			`Nav_ParentFolder = 2
			`Nav_SelectedParentFolder = 3
			`Nav_SelectedFile = 4
			`Nav_NeedToLoad = 9
			`Nav_OutOfBounds = -1
		*/

		if (this.nextIndex > this.pathObject.path.length)
			{  return `Nav_OutOfBounds;  }

		else if (this.currentEntry == undefined)
			{  return `Nav_NeedToLoad;  }

		else if (this.currentEntry[`Type] == `ImplicitFile ||
				  this.currentEntry[`Type] == `ExplicitFile)
			{  return `Nav_SelectedFile;  }

		// So we're at a folder.  If it's the last one we know it's selected.
		else if (this.nextIndex == this.pathObject.path.length)
			{
			if (this.nextIndex == 0)
				{  return `Nav_SelectedRootFolder;  }
			else
				{  return `Nav_SelectedParentFolder;  }
			}

		// and if there's more than one past it, we know it's not selected.
		else if (this.nextIndex <= this.pathObject.path.length - 2)
			{
			if (this.nextIndex == 0)
				{  return `Nav_RootFolder;  }
			else
				{  return `Nav_ParentFolder;  }
			}

		// but if there's only one past it, we need to know whether it's a file or a folder to know whether it's selected
		// or not.
		else
			{
			var lookahead = this.Duplicate();
			lookahead.Next();

			if (lookahead.currentEntry == undefined)
				{  
				this.needToLoad = lookahead.needToLoad;
				return `Nav_NeedToLoad;  
				}
			else if (lookahead.currentEntry[`Type] == `ImplicitFile ||
					  lookahead.currentEntry[`Type] == `ExplicitFile)
				{  
				if (this.nextIndex == 0)
					{  return `Nav_SelectedRootFolder;  }
				else
					{  return `Nav_SelectedParentFolder;  }
				}
			else // on a folder
				{  
				if (this.nextIndex == 0)
					{  return `Nav_RootFolder;  }
				else
					{  return `Nav_ParentFolder;  }
				}
			}
		};


	/* Function: AtEndOfPath
		Returns whether the iterator is at the end of the path.
	*/
	this.AtEndOfPath = function ()
		{
		return (this.nextIndex == this.pathObject.path.length);
		};


	/* Function: Duplicate
		Creates and returns a new iterator at the same position as this one.
	*/
	this.Duplicate = function ()
		{
		var newObject = new NDMenu_FileMenuOffsetPath_Iterator (this.pathObject);
		newObject.currentEntry = this.currentEntry;
		newObject.offsetFromParent = this.offsetFromParent;
		newObject.needToLoad = this.needToLoad;
		newObject.nextIndex = this.nextIndex;

		return newObject;
		};



	// Group: Properties
	// ________________________________________________________________________


	/* Property: currentEntry
		A reference to the entry in <NDMenu.fileMenuSections> the iterator is currently on.  This will be undefined if
		the entry is not loaded yet.
	*/
	this.currentEntry = NDMenu.GetFileMenuSection(1);  // Will return undefined if not loaded yet.

	/* Property: offsetFromParent
		The location of the current entry in its parent's member list.
	*/
	this.offsetFromParent = -1;

	/* Property: needToLoad
		If <currentEntry> is undefined while the iterator is still in bounds or <NavigationType> returns `Nav_NeedToLoad,
		this will hold the ID of the menu section that needs to be loaded.  The value is not relevant otherwise and is not 
		guaranteed to be undefined.

		Remember that you need to create a new iterator after loading a section of the menu.  Existing ones are not
		guaranteed to notice the new addition.
	*/
	// this.needToLoad = undefined;

	if (this.currentEntry == undefined)
		{  this.needToLoad = 1;  }



	// Group: Variables
	// ________________________________________________________________________


	/* var: pathObject
		A reference to the <NDMenu_FileMenuOffsetPath> object this iterator works on.
	*/
	this.pathObject = pathObject;

	/* var: nextIndex
		An index into <NDMenu_FileMenuOffsetPath.path> of the *next* position, not what the current position is.  
		This means an index of zero refers to the root folder even though entry zero in the path refers to the root folder's 
		member.
	*/
	this.nextIndex = 0;

	};



/* Class: NDMenu_FileMenuHashPath
	___________________________________________________________________________

	A path through <NDMenu's> hierarchy using a hash path string such as "File2:folder/folder/source.cs".  All paths are
	assumed to terminate on a file name instead of a folder.

*/
function NDMenu_FileMenuHashPath (hashPath)
	{

	// Group: Functions
	// ________________________________________________________________________

	/* Function: GetIterator
		Creates and returns a new <iterator: NDMenu_FileMenuOffsetPath_Iterator> positioned at the beginning of the path.
	*/
	this.GetIterator = function ()
		{
		// We generate a new offset path for every iterator created because a path can persist between menu section
		// loads, but an iterator should not.
		return new NDMenu_FileMenuOffsetPath_Iterator(this.MakeOffsetPath());
		};


	/* Function: MakeOffsetPath
		Generates and returns a <NDMenu_FileMenuOffsetPath> from the hash path string.
		
		If there are not enough menu sections loaded to fully resolve it, it will generate what it can and put an extra -1 
		offset on the end to indicate  that there's more.  The extra entry prevents things from rendering as selected 
		when they may not be.  <NDMenu_FileMenuOffsetPath_Iterator> shouldn't have to worry about handling the -1 
		because it would stop with `Nav_NeedToLoad before using it, and after the section is loaded new iterators will 
		have to be created which will cause this function to generate an updated offset path.

		If there are invalid sections of the hash path, such as a folder name that doesn't exist, this will generate as much
		as it can from the valid section and ignore the rest.
	*/
	this.MakeOffsetPath = function ()
		{
		var offsets = [ ];

		if (this.hashPathString == "" || this.hashPathString == undefined)
			{  return new NDMenu_FileMenuOffsetPath(offsets);  }

		var section = NDMenu.GetFileMenuSection(1);

		if (section === undefined)
			{
			offsets.push(-1);
			return new NDMenu_FileMenuOffsetPath(offsets);
			}

		// If you don't test for undefined the !StartsWith will work.
		if (this.hashPathString == section[`HashPath] || 
			(section[`HashPath] !== undefined && !this.hashPathString.StartsWith(section[`HashPath])) )
			{  return new NDMenu_FileMenuOffsetPath(offsets);  }

		do
			{
			var found = false;

			for (var i = 0; i < section[`Members].length; i++)
				{
				var member = section[`Members][i];

				if (member[`Type] == `ExplicitFile || member[`Type] == `ImplicitFile)
					{
					if (section[`HashPath] + member[`Name] == this.hashPathString)
						{
						offsets.push(i);
						return new NDMenu_FileMenuOffsetPath(offsets);
						}
					}
				else // folder
					{
					if (this.hashPathString == member[`HashPath])
						{
						offsets.push(i);
						return new NDMenu_FileMenuOffsetPath(offsets);
						}
					else if (this.hashPathString.StartsWith(member[`HashPath]))
						{
						offsets.push(i);
						section = member;
						found = true;

						if (section[`Type] == `DynamicFolder)	
							{
							section = NDMenu.GetFileMenuSection(section[`Members]);
							if (section === undefined)
								{
								offsets.push(-1);
								return new NDMenu_FileMenuOffsetPath(offsets);
								}
							}

						break;
						}
					}
				}
			}
		while (found == true);

		return new NDMenu_FileMenuOffsetPath(offsets);
		};



	// Group: Properties
	// ________________________________________________________________________

	/* Property: hashPathString
		The hash path string such as "File2:folder/folder/source.cs".
	*/
	this.hashPathString = hashPath;

	};
