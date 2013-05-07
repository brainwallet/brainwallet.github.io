function TextDrive() {
  this.windowController_ = this.settingsController_ = this.searchController_ = this.menuController_ = this.hotkeysController_ = this.dialogController_ = this.tabs_ = this.settings_ = this.editor_ = null;
  this.hasFrame_ = !1
}
TextDrive.prototype.init = function() {
  this.dialogController_ = new DialogController($("#dialog-container"));
  this.settings_ = new Settings;
  this.editor_ = new Editor("editor", this.settings_);
  this.tabs_ = new Tabs(this.editor_, this.dialogController_, this.settings_);
  this.hotkeysController_ = new HotkeysController(this.tabs_, this.editor_);
  this.menuController_ = new MenuController(this.tabs_);
  this.searchController_ = new SearchController(this.editor_);
  this.settingsController_ = new SettingsController(this.settings_);
  this.windowController_ = new WindowController(this.editor_);
  chrome.runtime.getBackgroundPage(function(a) {
    a.background.onWindowReady(this)
  }.bind(this))
};
TextDrive.prototype.openEntries = function(a) {
  for(var b = 0;b < a.length;b++) {
    this.tabs_.openFileEntry(a[b])
  }
};
TextDrive.prototype.openNew = function() {
  this.tabs_.newTab()
};
TextDrive.prototype.setHasChromeFrame = function(a) {
  this.hasFrame_ = a;
  this.windowController_.windowControlsVisible(!a)
};
TextDrive.prototype.getFilesToSave = function() {
  return this.settings_.get("autosave") ? this.tabs_.getFilesToSave() : []
};
var textDrive = new TextDrive;
$(document).ready(textDrive.init.bind(textDrive));
var EditSession = ace.require("ace/edit_session").EditSession, UndoManager = ace.require("ace/undomanager").UndoManager;
function Editor(a, b) {
  this.elementId_ = a;
  this.settings_ = b;
  this.editor_ = ace.edit(this.elementId_);
  this.initTheme_();
  this.editor_.on("change", this.onChange.bind(this));
  this.editor_.setShowPrintMargin(!1);
  this.editor_.setShowFoldWidgets(!1);
  this.editor_.commands.bindKey("ctrl-shift-l", null);
  $(document).bind("resize", this.editor_.resize.bind(this.editor_));
  $(document).bind("settingschange", this.onSettingsChanged_.bind(this));
  $(document).bind("tabrenamed", this.onTabRenamed_.bind(this));
  this.settings_.isReady() ? this.editor_.initFromSettings_() : $(document).bind("settingsready", this.initFromSettings_.bind(this))
}
Editor.EXTENSION_TO_MODE = {bash:"sh", bib:"latex", cfm:"coldfusion", clj:"clojure", coffee:"coffee", c:"c_cpp", "c++":"c_cpp", cc:"c_cpp", cs:"csharp", css:"css", cpp:"c_cpp", cxx:"c_cpp", diff:"diff", gemspec:"ruby", go:"golang", groovy:"groovy", h:"c_cpp", hh:"c_cpp", hpp:"c_cpp", htm:"html", html:"html", hx:"haxe", java:"java", js:"javascript", json:"json", latex:"latex", less:"less", liquid:"liquid", ltx:"latex", lua:"lua", markdown:"markdown", md:"markdown", ml:"ocaml", mli:"ocaml", patch:"diff", 
pgsql:"pgsql", pl:"perl", pm:"perl", php:"php", phtml:"php", ps1:"powershell", py:"python", rb:"ruby", rdf:"xml", rss:"xml", ru:"ruby", rake:"rake", scad:"scad", scala:"scala", sass:"scss", scss:"scss", sh:"sh", sql:"sql", svg:"svg", tex:"latex", txt:"txt", textile:"textile", xhtml:"html", xml:"xml", xq:"xquery", yaml:"yaml"};
Editor.prototype.initTheme_ = function() {
  for(var a = null, b = 0;b < document.styleSheets.length;b++) {
    if(document.styleSheets[b].href && document.styleSheets[b].href.indexOf("ace.css")) {
      a = document.styleSheets[b];
      break
    }
  }
  a || console.error("Didn't find stylesheet for Ace");
  for(var c = "", b = 0;b < a.cssRules.length;b++) {
    c += "\n" + a.cssRules[b].cssText
  }
  ace.define("ace/theme/textdrive", ["require", "exports", "module", "ace/lib/dom"], function(a, b) {
    b.cssClass = "ace-td";
    b.cssText = c;
    a("../lib/dom").importCssString(b.cssText, b.cssClass)
  });
  this.editor_.setTheme("ace/theme/textdrive")
};
Editor.prototype.initFromSettings_ = function() {
  this.setFontSize(this.settings_.get("fontsize"));
  this.showHideLineNumbers_(this.settings_.get("linenumbers"))
};
Editor.prototype.newSession = function(a) {
  session = new EditSession(a || "");
  session.getMode().getNextLineIndent = function(a, c) {
    return this.$getIndent(c)
  };
  a = new UndoManager;
  session.setUndoManager(a);
  session.setUseWrapMode(this.settings_.get("wraplines"));
  return session
};
Editor.prototype.setSession = function(a) {
  this.editor_.setSession(a)
};
Editor.prototype.find = function(a) {
  options = {wrap:!0, start:this.editor_.getSelectionRange().start};
  this.editor_.find(a, options, !0)
};
Editor.prototype.findNext = function() {
  this.editor_.findNext({wrap:!0}, !0)
};
Editor.prototype.clearSearch = function() {
  var a = this.editor_.getSelectionRange();
  this.editor_.moveCursorToPosition(a.start)
};
Editor.prototype.onChange = function() {
  $.event.trigger("docchange", this.editor_.getSession())
};
Editor.prototype.undo = function() {
  this.editor_.undo()
};
Editor.prototype.redo = function() {
  this.editor_.redo()
};
Editor.prototype.focus = function() {
  this.editor_.focus()
};
Editor.prototype.setMode = function(a, b) {
  var c = Editor.EXTENSION_TO_MODE[b];
  c && a.setMode("ace/mode/" + c)
};
Editor.prototype.onTabRenamed_ = function(a, b) {
  var c = b.getExtension();
  c && this.setMode(b.getSession(), c)
};
Editor.prototype.onSettingsChanged_ = function(a, b, c) {
  switch(b) {
    case "fontsize":
      this.setFontSize(c);
      break;
    case "linenumbers":
      this.showHideLineNumbers_(c)
  }
};
Editor.prototype.increaseFontSize = function() {
  var a = this.settings_.get("fontsize");
  this.settings_.set("fontsize", 1.125 * a)
};
Editor.prototype.decreseFontSize = function() {
  var a = this.settings_.get("fontsize");
  this.settings_.set("fontsize", a / 1.125)
};
Editor.prototype.setFontSize = function(a) {
  this.editor_.setFontSize(Math.round(a) + "px")
};
Editor.prototype.showHideLineNumbers_ = function(a) {
  $("#" + this.elementId_).toggleClass("hide-line-numbers", !a);
  this.editor_.resize(!0)
};
function Settings() {
  this.ready_ = !1;
  this.settings_ = {};
  var a = {}, b;
  for(b in Settings.SETTINGS) {
    this.settings_[b] = Settings.SETTINGS[b]["default"], a["settings-" + b] = this.settings_[b]
  }
  this.storage_ = chrome.storage[Settings.AREA];
  chrome.storage.onChanged.addListener(this.onChanged_.bind(this));
  this.storage_.get(a, this.getSettingsCallback_.bind(this))
}
Settings.AREA = "sync";
Settings.SETTINGS = {autosave:{"default":!1, type:"boolean", widget:"checkbox"}, fontsize:{"default":14, type:"number", widget:null}, linenumbers:{"default":!0, type:"boolean", widget:"checkbox"}, margin:{"default":!1, type:"boolean", widget:"checkbox"}, margincol:{degault:80, type:"integer", widget:"number"}, tabsize:{"default":8, type:"integer", widget:"number"}, wraplines:{"default":!0, type:"boolean", widget:"checkbox"}};
Settings.prototype.get = function(a) {
  return this.settings_[a]
};
Settings.prototype.getAll = function() {
  return this.settings_
};
Settings.prototype.set = function(a, b) {
  var c = {};
  c["settings-" + a] = b;
  this.storage_.set(c)
};
Settings.prototype.isReady = function() {
  return this.ready_
};
Settings.prototype.getSettingsCallback_ = function(a) {
  this.ready_ = !0;
  for(var b in a) {
    var c = a[b];
    b = b.substring(9);
    this.settings_[b] = c
  }
  $.event.trigger("settingsready")
};
Settings.prototype.onChanged_ = function(a, b) {
  if(b !== Settings.AREA) {
    console.warn("Storage change in wrong area. Maybe a bug?")
  }else {
    for(var c in a) {
      if(0 === c.indexOf("settings-")) {
        var d = a[c].newValue;
        c = c.substring(9);
        console.log("Settings changed:", c, d);
        this.settings_[c] = d;
        $.event.trigger("settingschange", [c, d])
      }
    }
  }
};
function Tab(a, b, c) {
  this.id_ = a;
  this.session_ = b;
  this.entry_ = c;
  this.saved_ = !0;
  this.path_ = null;
  this.entry_ && this.updatePath_()
}
Tab.prototype.getId = function() {
  return this.id_
};
Tab.prototype.getName = function() {
  return this.entry_ ? this.entry_.name : "Untitled " + this.id_
};
Tab.prototype.getExtension = function() {
  if(!this.entry_) {
    return null
  }
  var a = /\.([^.\\\/]+)$/.exec(this.getName());
  return a ? a[1] : null
};
Tab.prototype.getSession = function() {
  return this.session_
};
Tab.prototype.setEntry = function(a) {
  var b = this.getName() != a.name;
  this.entry_ = a;
  b && $.event.trigger("tabrenamed", this);
  this.updatePath_()
};
Tab.prototype.getEntry = function() {
  return this.entry_
};
Tab.prototype.getContents = function() {
  return this.session_.getValue()
};
Tab.prototype.getPath = function() {
  return this.path_
};
Tab.prototype.setTabSize = function(a) {
  this.session_.setTabSize(a)
};
Tab.prototype.setWrapping = function(a) {
  this.session_.setUseWrapMode(a)
};
Tab.prototype.updatePath_ = function() {
  chrome.fileSystem.getDisplayPath(this.entry_, function(a) {
    this.path_ = a
  }.bind(this))
};
Tab.prototype.save = function(a) {
  util.writeFile(this.entry_, this.session_.getValue(), function() {
    this.saved_ = !0;
    $.event.trigger("tabsave", this);
    a && a()
  }.bind(this))
};
Tab.prototype.isSaved = function() {
  return this.saved_
};
Tab.prototype.changed = function() {
  this.saved_ && (this.saved_ = !1, $.event.trigger("tabchange", this))
};
function Tabs(a, b, c) {
  this.editor_ = a;
  this.dialogController_ = b;
  this.settings_ = c;
  this.tabs_ = [];
  this.currentTab_ = null;
  $(document).bind("docchange", this.onDocChanged_.bind(this));
  $(document).bind("settingschange", this.onSettingsChanged_.bind(this))
}
Tabs.prototype.getTabById = function(a) {
  for(var b = 0;b < this.tabs_.length;b++) {
    if(this.tabs_[b].getId() === a) {
      return this.tabs_[b]
    }
  }
  return null
};
Tabs.prototype.getCurrentTab = function() {
  return this.currentTab_
};
Tabs.prototype.newTab = function(a, b) {
  for(var c = 1;this.getTabById(c);) {
    c++
  }
  var d = this.editor_.newSession(a), c = new Tab(c, d, b || null);
  c.setTabSize(this.settings_.get("tabsize"));
  var e = c.getExtension();
  e && this.editor_.setMode(d, e);
  this.tabs_.push(c);
  $.event.trigger("newtab", c);
  this.showTab(c.getId())
};
Tabs.prototype.nextTab = function() {
  for(var a = 0;a < this.tabs_.length;a++) {
    if(this.tabs_[a] === this.currentTab_) {
      var b = a + 1;
      b === this.tabs_.length && (b = 0);
      b !== a && this.showTab(this.tabs_[b].getId());
      break
    }
  }
};
Tabs.prototype.showTab = function(a) {
  a = this.getTabById(a);
  this.editor_.setSession(a.getSession());
  this.currentTab_ = a;
  $.event.trigger("switchtab", a);
  this.editor_.focus()
};
Tabs.prototype.close = function(a) {
  for(var b = 0;b < this.tabs_.length && this.tabs_[b].getId() != a;b++) {
  }
  if(b >= this.tabs_.length) {
    console.error("Can't find tab", a)
  }else {
    var c = this.tabs_[b];
    c.isSaved() ? this.closeTab_(c) : this.settings_.get("autosave") && c.getEntry() ? this.save(c, !0) : (this.dialogController_.setText("Do you want to save the file before closing?"), this.dialogController_.resetButtons(), this.dialogController_.addButton("yes", "Yes"), this.dialogController_.addButton("no", "No"), this.dialogController_.addButton("cancel", "Cancel"), this.dialogController_.show(function(a) {
      "yes" === a ? this.save(c, !0) : "no" === a && this.closeTab_(c)
    }.bind(this)))
  }
};
Tabs.prototype.closeTab_ = function(a) {
  a === this.currentTab_ && (1 < this.tabs_.length ? this.nextTab() : window.close());
  for(var b = 0;b < this.tabs_.length && this.tabs_[b] !== a;b++) {
  }
  this.tabs_.splice(b, 1);
  $.event.trigger("tabclosed", a)
};
Tabs.prototype.closeCurrent = function() {
  this.close(this.currentTab_.getId())
};
Tabs.prototype.openFile = function() {
  chrome.fileSystem.chooseEntry({type:"openWritableFile"}, this.openFileEntry.bind(this))
};
Tabs.prototype.save = function(a, b) {
  a || (a = this.currentTab_);
  if(a.getEntry()) {
    var c = null;
    b && (c = this.closeTab_.bind(this, a));
    a.save(c)
  }else {
    this.saveAs(a, b)
  }
};
Tabs.prototype.saveAs = function(a, b) {
  a || (a = this.currentTab_);
  chrome.fileSystem.chooseEntry({type:"saveFile"}, this.onSaveAsFileOpen_.bind(this, a, b || !1))
};
Tabs.prototype.getFilesToSave = function() {
  var a = [];
  for(i = 0;i < this.tabs_.length;i++) {
    !this.tabs_[i].isSaved() && this.tabs_[i].getEntry() && a.push({entry:this.tabs_[i].getEntry(), contents:this.tabs_[i].getContents()})
  }
  return a
};
Tabs.prototype.openFileEntry = function(a) {
  a && chrome.fileSystem.getDisplayPath(a, function(b) {
    for(var c = 0;c < this.tabs_.length;c++) {
      if(this.tabs_[c].getPath() === b) {
        this.showTab(this.tabs_[c].getId());
        return
      }
    }
    a.file(this.readFileToNewTab_.bind(this, a))
  }.bind(this))
};
Tabs.prototype.readFileToNewTab_ = function(a, b) {
  var c = this, d = new FileReader;
  d.onerror = util.handleFSError;
  d.onloadend = function() {
    c.newTab(this.result, a);
    2 === c.tabs_.length && (!c.tabs_[0].getEntry() && c.tabs_[0].isSaved()) && c.close(c.tabs_[0].getId())
  };
  d.readAsText(b)
};
Tabs.prototype.onSaveAsFileOpen_ = function(a, b, c) {
  c && (a.setEntry(c), this.save(a, b))
};
Tabs.prototype.onDocChanged_ = function(a, b) {
  var c = this.currentTab_;
  if(this.currentTab_.getSession() !== b) {
    console.warn("Something wrong. Current session should be", this.currentTab_.getSession(), ", but this session was changed:", b);
    for(var d = 0;d < this.tabs_;d++) {
      if(this.tabs_[d].getSession() === b) {
        c = this.tabs_[d];
        break
      }
    }
    if(c === this.currentTab_) {
      console.error("Unkown tab changed.");
      return
    }
  }
  c.changed()
};
Tabs.prototype.onSettingsChanged_ = function(a, b, c) {
  switch(b) {
    case "tabsize":
      if(0 === c) {
        this.settings_.set("tabsize", 8);
        break
      }
      for(a = 0;a < this.tabs_.length;a++) {
        this.tabs_[a].setTabSize(c)
      }
      break;
    case "wraplines":
      for(a = 0;a < this.tabs_.length;a++) {
        this.tabs_[a].setWrapping(c)
      }
  }
};
var util = {handleFSError:function(a) {
  var b = "";
  switch(a.code) {
    case FileError.QUOTA_EXCEEDED_ERR:
      b = "QUOTA_EXCEEDED_ERR";
      break;
    case FileError.NOT_FOUND_ERR:
      b = "NOT_FOUND_ERR";
      break;
    case FileError.SECURITY_ERR:
      b = "SECURITY_ERR";
      break;
    case FileError.INVALID_MODIFICATION_ERR:
      b = "INVALID_MODIFICATION_ERR";
      break;
    case FileError.INVALID_STATE_ERR:
      b = "INVALID_STATE_ERR";
      break;
    default:
      b = "Unknown Error"
  }
  console.warn("FS Error:", a, b)
}, writeFile:function(a, b, c) {
  b = new Blob([b], {type:"text/plain"});
  chrome.fileSystem.getWritableEntry(a, util.truncateAndWriteWritable_.bind(null, b, c))
}, truncateAndWriteWritable_:function(a, b, c) {
  c.createWriter(function(c) {
    c.onerror = util.handleFSError;
    c.onwrite = util.writeToWriter_.bind(null, c, a, b);
    c.truncate(a.size)
  })
}, writeToWriter_:function(a, b, c) {
  a.onwrite = c;
  a.write(b)
}};
function DialogController(a) {
  this.container_ = a
}
DialogController.prototype.show = function(a) {
  this.container_.hasClass("open") ? (console.error("Trying to open dialog when it is already visible."), console.error(Error())) : (this.callback_ = a, this.container_.addClass("open"), $("#editor textarea").attr("tabIndex", "-1"), $(document).bind("keydown.dialog", this.onKeydown_.bind(this)), this.container_.find(".dialog-button").first().focus())
};
DialogController.prototype.resetButtons = function() {
  this.container_.find(".dialog-button").remove()
};
DialogController.prototype.addButton = function(a, b) {
  var c = $('<div class="dialog-button"></div>');
  c.attr("tabindex", "0");
  c.text(b);
  c.click(this.onClick_.bind(this, a));
  c.keydown(this.onKeydown_.bind(this));
  this.container_.find(".dialog-buttons").append(c)
};
DialogController.prototype.setText = function(a) {
  this.container_.find(".dialog-text").text(a)
};
DialogController.prototype.onClick_ = function(a) {
  $(document).unbind("keydown.dialog");
  $("#editor textarea").attr("tabIndex", "0");
  this.container_.removeClass("open");
  this.callback_(a)
};
DialogController.prototype.onKeydown_ = function(a) {
  a.stopPropagation();
  if(27 === a.keyCode) {
    this.onClick_("cancel")
  }
  return!1
};
function HotkeysController(a, b) {
  this.tabs_ = a;
  this.editor_ = b;
  this.KEY = {};
  for(var c = 65;90 >= c;c++) {
    this.KEY[String.fromCharCode(c).toUpperCase()] = c
  }
  this.KEY.TAB = 9;
  this.KEY.SPACE = 32;
  this.KEY.EQUALS = 187;
  this.KEY.MINUS = 189;
  $(document).keydown(this.onKeydown_.bind(this))
}
HotkeysController.prototype.onKeydown_ = function(a) {
  if(a.ctrlKey || a.metaKey) {
    switch(a.keyCode) {
      case this.KEY.TAB:
        return this.tabs_.nextTab(), !1;
      case this.KEY.F:
        return $("#search-button").click(), !1;
      case this.KEY.N:
        return this.tabs_.newTab(), !1;
      case this.KEY.O:
        return this.tabs_.openFile(), !1;
      case this.KEY.S:
        return a.shiftKey ? this.tabs_.saveAs() : this.tabs_.save(), !1;
      case this.KEY.W:
        return this.tabs_.closeCurrent(), !1;
      case this.KEY.Z:
        if(a.shiftKey) {
          return this.editor_.redo(), !1
        }
        break;
      case this.KEY.EQUALS:
        return this.editor_.increaseFontSize(), !1;
      case this.KEY.MINUS:
        return this.editor_.decreseFontSize(), !1
    }
  }else {
    if(a.altKey && a.keyCode === this.KEY.SPACE) {
      return $("#toggle-sidebar").click(), !1
    }
  }
};
function MenuController(a) {
  this.tabs_ = a;
  $("#file-menu-new").click(this.newTab_.bind(this));
  $("#file-menu-open").click(this.open_.bind(this));
  $("#file-menu-save").click(this.save_.bind(this));
  $("#file-menu-saveas").click(this.saveas_.bind(this));
  $(document).bind("newtab", this.onNewTab.bind(this));
  $(document).bind("tabchange", this.onTabChange.bind(this));
  $(document).bind("tabclosed", this.onTabClosed.bind(this));
  $(document).bind("tabrenamed", this.onTabRenamed.bind(this));
  $(document).bind("tabsave", this.onTabSave.bind(this));
  $(document).bind("switchtab", this.onSwitchTab.bind(this))
}
MenuController.prototype.onNewTab = function(a, b) {
  var c = b.getId(), d = b.getName(), d = $('<li id="tab' + c + '"><div class="filename">' + d + '</div><div class="close"></div></li>');
  d.appendTo($("#tabs-list"));
  d.click(this.tabButtonClicked_.bind(this, c));
  d.find(".close").click(this.closeTabClicked_.bind(this, c))
};
MenuController.prototype.onTabRenamed = function(a, b) {
  $("#tab" + b.getId() + " .filename").text(b.getName())
};
MenuController.prototype.onTabChange = function(a, b) {
  $("#tab" + b.getId()).addClass("unsaved")
};
MenuController.prototype.onTabClosed = function(a, b) {
  $("#tab" + b.getId()).remove()
};
MenuController.prototype.onTabSave = function(a, b) {
  $("#tab" + b.getId()).removeClass("unsaved")
};
MenuController.prototype.onSwitchTab = function(a, b) {
  $("#tabs-list li.active").removeClass("active");
  $("#tab" + b.getId()).addClass("active")
};
MenuController.prototype.newTab_ = function() {
  this.tabs_.newTab();
  return!1
};
MenuController.prototype.open_ = function() {
  this.tabs_.openFile();
  return!1
};
MenuController.prototype.save_ = function() {
  this.tabs_.save();
  return!1
};
MenuController.prototype.saveas_ = function() {
  this.tabs_.saveAs();
  return!1
};
MenuController.prototype.tabButtonClicked_ = function(a) {
  this.tabs_.showTab(a);
  return!1
};
MenuController.prototype.closeTabClicked_ = function(a) {
  this.tabs_.close(a)
};
function SearchController(a) {
  this.editor_ = a;
  this.currentSearch_ = "";
  $("#search-button").click(this.onSearchButton_.bind(this));
  $("#search-input").focusout(this.onFocusOut_.bind(this));
  $("#search-input").bind("input", this.onChange_.bind(this));
  $("#search-input").keydown(this.onKeydown_.bind(this))
}
SearchController.prototype.onSearchButton_ = function() {
  $("header").addClass("search-active");
  setTimeout(function() {
    $("#search-input").focus()
  }, 100);
  return!1
};
SearchController.prototype.onFocusOut_ = function() {
  $("#search-input").val("");
  $("header").removeClass("search-active")
};
SearchController.prototype.onChange_ = function() {
  var a = $("#search-input").val();
  a !== this.currentSearch_ && (this.currentSearch_ = a) && this.editor_.find(a)
};
SearchController.prototype.onKeydown_ = function(a) {
  switch(a.keyCode) {
    case 13:
      a.stopPropagation();
      this.editor_.findNext(this.currentSearch_);
      break;
    case 27:
      a.stopPropagation(), $("#search-input").val(""), this.editor_.focus()
  }
};
function SettingsController(a) {
  this.settings_ = a;
  this.settings_.isReady() ? this.showAll_() : $(document).bind("settingsready", this.showAll_.bind(this));
  $(document).bind("settingschange", this.onSettingChange_.bind(this));
  this.bindChanges_();
  $("#open-settings").click(this.open_.bind(this));
  $("#close-settings").click(this.close_.bind(this))
}
SettingsController.prototype.bindChanges_ = function() {
  for(var a in Settings.SETTINGS) {
    switch(Settings.SETTINGS[a].widget) {
      case "checkbox":
      ;
      case "number":
        $("#setting-" + a).change(this.onWidgetChange_.bind(this, a))
    }
  }
};
SettingsController.prototype.open_ = function() {
  $("#sidebar").addClass("open-settings")
};
SettingsController.prototype.close_ = function() {
  $("#sidebar").removeClass("open-settings")
};
SettingsController.prototype.showAll_ = function() {
  var a = this.settings_.getAll();
  for(key in a) {
    this.show_(key, a[key])
  }
};
SettingsController.prototype.show_ = function(a, b) {
  switch(Settings.SETTINGS[a].widget) {
    case "checkbox":
      $("#setting-" + a).prop("checked", b);
      break;
    case "number":
      $("#setting-" + a).val(b)
  }
};
SettingsController.prototype.onSettingChange_ = function(a, b, c) {
  this.show_(b, c)
};
SettingsController.prototype.onWidgetChange_ = function(a) {
  var b;
  switch(Settings.SETTINGS[a].widget) {
    case "checkbox":
      b = $("#setting-" + a).prop("checked");
      break;
    case "number":
      b = parseInt($("#setting-" + a).val())
  }
  this.settings_.set(a, b)
};
function WindowController(a) {
  this.editor_ = a;
  this.currentTab_ = null;
  $("#window-close").click(this.close_.bind(this));
  $("#window-maximize").click(this.maximize_.bind(this));
  $("#toggle-sidebar").click(this.toggleSidebar_.bind(this));
  $(document).bind("switchtab", this.onChangeTab_.bind(this));
  $(document).bind("tabrenamed", this.onChangeTab_.bind(this));
  $(document).bind("tabchange", this.onTabChange_.bind(this));
  $(document).bind("tabsave", this.onTabChange_.bind(this))
}
WindowController.prototype.windowControlsVisible = function(a) {
  a ? $("header").removeClass("hide-controls") : $("header").addClass("hide-controls")
};
WindowController.prototype.close_ = function() {
  window.close()
};
WindowController.prototype.maximize_ = function() {
  window.outerHeight == window.screen.availHeight && window.outerWidth == window.screen.availWidth ? (window.chrome.app.window.current().restore(), $("#window-maximize").attr("title", "Maximize")) : (window.chrome.app.window.current().maximize(), $("#window-maximize").attr("title", "Restore"))
};
WindowController.prototype.toggleSidebar_ = function() {
  $("body").toggleClass("sidebar-open");
  this.editor_.focus();
  $("body").hasClass("sidebar-open") ? $("#toggle-sidebar").attr("title", "Close sidebar") : $("#toggle-sidebar").attr("title", "Open sidebar");
  setTimeout(function() {
    $.event.trigger("resize")
  }, 200)
};
WindowController.prototype.onChangeTab_ = function(a, b) {
  this.currentTab_ = b;
  $("#title-filename").text(b.getName())
};
WindowController.prototype.onTabChange_ = function() {
  this.currentTab_.isSaved() ? $("#title-filename").removeClass("unsaved") : $("#title-filename").addClass("unsaved")
};
