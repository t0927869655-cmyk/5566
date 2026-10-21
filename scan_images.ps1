# ==========================================================================
# 全聯條碼查詢系統 - 自動掃描與資料庫重新產生腳本 (2026年10月)
# ==========================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$workspace = $PSScriptRoot
if ([string]::IsNullOrEmpty($workspace)) {
    $workspace = Get-Location
}

Write-Host "正在掃描賣場商品目錄與條碼圖檔..." -ForegroundColor Cyan

# 尋找最新官方 Excel 資料庫 (自動比對 1010 或最新日期版本)
$parentDir = Split-Path $workspace -Parent
$excelCandidates = @()
if (Test-Path -LiteralPath $parentDir) {
    $excelCandidates += Get-ChildItem -LiteralPath $parentDir -Filter "全聯_條碼查詢_*.xlsx" -File -ErrorAction SilentlyContinue
}
$excelCandidates += Get-ChildItem -LiteralPath $workspace -Filter "全聯_條碼查詢_*.xlsx" -File -ErrorAction SilentlyContinue

$excelFile = $null
if ($excelCandidates.Count -gt 0) {
    $excelFile = ($excelCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
} else {
    $defaultCandidate = Join-Path $parentDir "全聯_條碼查詢_1010.xlsx"
    if (Test-Path -LiteralPath $defaultCandidate) {
        $excelFile = $defaultCandidate
    } else {
        $excelFile = Join-Path $workspace "全聯_條碼查詢_1010.xlsx"
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

# 載入先前既有資料庫作為保護與回退機制 (保留未在主表中的促銷品等資訊)
$existingDataMap = @{}
$existingJsonPath = Join-Path $workspace "products_data.json"
if (Test-Path -LiteralPath $existingJsonPath) {
    try {
        $prevProducts = Get-Content -LiteralPath $existingJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($p in $prevProducts) {
            if ($p.code) { $existingDataMap[$p.code] = $p }
            if ($p.image) { $existingDataMap[$p.image] = $p }
        }
    } catch {}
}

$zip = $null
$sharedStrings = @()
$excelItems = @{}
$cat6Items = @{}

if ($excelFile -and (Test-Path -LiteralPath $excelFile)) {
    Write-Host "找到官方 Excel 檔: $excelFile" -ForegroundColor Green
    $zip = [System.IO.Compression.ZipFile]::OpenRead($excelFile)
    
    # 讀取共用字串
    $ssEntry = $zip.GetEntry("xl/sharedStrings.xml")
    if ($ssEntry) {
        $stream = $ssEntry.Open()
        $reader = New-Object System.IO.StreamReader($stream)
        [xml]$ssXml = $reader.ReadToEnd()
        $reader.Close()
        $stream.Close()
        foreach ($si in $ssXml.sst.si) {
            if ($si.t) { $sharedStrings += $si.t }
            elseif ($si.r) { 
                $sharedStrings += (($si.r | ForEach-Object { $_.t }) -join "")
            } else {
                $sharedStrings += ""
            }
        }
    }

    function Get-CellVal($c) {
        if (-not $c) { return "" }
        if ($c.t -eq "s") {
            $idx = [int]$c.v
            if ($idx -lt $sharedStrings.Count) { return $sharedStrings[$idx] }
        }
        if ($c.v) {
            if ($c.v -is [System.Xml.XmlNode]) { return $c.v.InnerText.Trim() }
            return $c.v.ToString().Trim()
        }
        return ""
    }

    # 讀取 Sheet 1 (產品目錄)
    $s1Entry = $zip.GetEntry("xl/worksheets/sheet1.xml")
    if ($s1Entry) {
        $s = $s1Entry.Open()
        $r = New-Object System.IO.StreamReader($s)
        [xml]$s1Xml = $r.ReadToEnd()
        $r.Close()
        $s.Close()
        $rows = $s1Xml.worksheet.sheetData.row
        for ($i = 1; $i -lt $rows.Count; $i++) {
            $row = $rows[$i]
            $cells = @{}
            foreach ($c in $row.c) {
                $col = $c.r -replace '\d+', ''
                $cells[$col] = Get-CellVal $c
            }
            if ($cells['C'] -or $cells['D']) {
                $codeKey = "$($cells['C'])_$($cells['D'])"
                $excelItems[$codeKey] = @{
                    Category = $cells['A']
                    Subcategory = $cells['B']
                    Code = $cells['C']
                    Name = $cells['D']
                    PxCode = $cells['E']
                    Barcode = $cells['F']
                    ShelfDate = $cells['H']
                    SaleType = $cells['I']
                }
            }
        }
    }

    # 讀取 Sheet 9 (年節禮盒)
    $s9Entry = $zip.GetEntry("xl/worksheets/sheet9.xml")
    if ($s9Entry) {
        $s = $s9Entry.Open()
        $r = New-Object System.IO.StreamReader($s)
        [xml]$s9Xml = $r.ReadToEnd()
        $r.Close()
        $s.Close()
        $rows9 = $s9Xml.worksheet.sheetData.row
        for ($ri = 0; $ri -lt $rows9.Count; $ri++) {
            $row = $rows9[$ri]
            $rNum = [int]$row.r
            if ($rNum % 4 -eq 2) {
                $barcodeRowNum = $rNum + 2
                $bRow = $rows9 | Where-Object { [int]$_.r -eq $barcodeRowNum }
                $bCells = @{}
                if ($bRow) {
                    foreach ($bc in $bRow.c) {
                        $bCol = $bc.r -replace '\d+', ''
                        $bCells[$bCol] = Get-CellVal $bc
                    }
                }
                foreach ($c in $row.c) {
                    $col = $c.r -replace '\d+', ''
                    $nameVal = Get-CellVal $c
                    if ($nameVal -match '^(\d+-\d+-\d+)(.*)') {
                        $code = $matches[1]
                        $pname = $matches[2]
                        $bcVal = $bCells[$col]
                        $cat6Items[$code] = @{
                            Code = $code
                            Name = $pname
                            Barcode = $bcVal
                        }
                    }
                }
            }
        }
    }
    $zip.Dispose()
}

# 目錄結構與分類元資料
$categoriesMeta = @(
    @{ id = "1"; dir = "1.卡迪那"; name = "卡迪那"; fullName = "1.卡迪那"; icon = "1.卡迪那.png"; color = "#e60012"; badge = "鮮切洋芋片/薯條" },
    @{ id = "2"; dir = "2.可樂果"; name = "可樂果"; fullName = "2.可樂果"; icon = "2.可樂果.png"; color = "#ffd200"; badge = "豌豆酥系列" },
    @{ id = "3"; dir = "3.元本山"; name = "元本山"; fullName = "3.元本山"; icon = "3.元本山.png"; color = "#007a3d"; badge = "海苔/堅果夾心" },
    @{ id = "4.1"; dir = "4.1萬歲牌-1(150.180.210系列)"; name = "萬歲牌 (系列一)"; fullName = "4.1萬歲牌-1(150.180.210系列)"; icon = "4.1萬歲牌-1(150.180.210系列).png"; color = "#e84a27"; badge = "150/180/210系列" },
    @{ id = "4.2"; dir = "4.2萬歲牌-2(其他)"; name = "萬歲牌 (系列二)"; fullName = "4.2萬歲牌-2(其他)"; icon = "4.2萬歲牌-2(其他).png"; color = "#c7431d"; badge = "罐裝/大包/堅穀力" },
    @{ id = "5"; dir = "5.堅果飲"; name = "堅果飲+荷卡"; fullName = "5.堅果飲"; icon = "5.堅果飲.png"; color = "#b8860b"; badge = "沖泡飲/濃湯麵" },
    @{ id = "6"; dir = "6-堅果罐.海苔禮盒"; name = "堅果罐/禮盒"; fullName = "6-堅果罐.海苔禮盒"; icon = "6-堅果罐.海苔禮盒.png"; color = "#3b7a57"; badge = "年節/堅果海苔禮盒" },
    @{ id = "7"; dir = "7-短銷品"; name = "短銷促銷品"; fullName = "7-短銷品"; icon = "7-短銷品.png"; color = "#d9381e"; badge = "限定新品特促" }
)

# 掃描本地所有分類資料夾圖檔
$allProducts = @()
$idx = 0

foreach ($cat in $categoriesMeta) {
    $dirPath = Join-Path $workspace $cat.dir
    if (-not (Test-Path -LiteralPath $dirPath)) { continue }

    # 排除無編碼且重複的臨時檔案 (如 圖片26.jpg)
    $files = Get-ChildItem -LiteralPath $dirPath -File | Where-Object { 
        $_.Name -match '\.(jpg|jpeg|png|gif|bmp)$' -and $_.Name -notmatch '^圖片\d+\.jpg$'
    } | Sort-Object Name
    Write-Host "目錄 $($cat.dir): 找到 $($files.Count) 張條碼圖檔"

    foreach ($file in $files) {
        $filename = $file.Name
        $match = $filename -match '^([\d.-]+)(.*)\.(jpg|jpeg|png|gif|bmp)$'
        $code = if ($match) { $matches[1].Trim() } else { "" }
        $name = if ($match) { $matches[2].Trim() } else { [System.IO.Path]::GetFileNameWithoutExtension($filename) }

        # 從 Excel 補齊全聯貨號與國際條碼
        $pxCode = ""
        $barcode = ""
        $subcat = ""
        $shelfDate = ""
        $saleType = ""

        # 比對 Excel Items
        $found = $null
        if ($code) {
            foreach ($k in $excelItems.Keys) {
                $item = $excelItems[$k]
                $itemName = [string]$item.Name
                if ($item.Code -eq $code -and ($itemName.Contains($name) -or $name.Contains($itemName) -or ($itemName.Length -ge 3 -and $name.Contains($itemName.Substring(0, [Math]::Min(5, $itemName.Length)))))) {
                    $found = $item
                    break
                }
            }
            if (-not $found) {
                foreach ($k in $excelItems.Keys) {
                    if ($excelItems[$k].Code -eq $code) {
                        $found = $excelItems[$k]
                        break
                    }
                }
            }
        }

        # 若檔名無編碼，嘗試以品名比對 Excel
        if (-not $found -and $name) {
            foreach ($k in $excelItems.Keys) {
                $item = $excelItems[$k]
                $itemName = [string]$item.Name
                if ($itemName -and ($itemName -eq $name -or $itemName.Contains($name) -or $name.Contains($itemName))) {
                    $found = $item
                    if (-not $code) { $code = $item.Code }
                    break
                }
            }
        }

        if ($found) {
            $pxCode = [string]$found.PxCode
            $barcode = [string]$found.Barcode
            $subcat = [string]$found.Subcategory
            $shelfDate = [string]$found.ShelfDate
            $saleType = [string]$found.SaleType

            # 格式調整：若 shelfDate 是售價而 saleType 是月份
            if ($saleType -match '^\d{4}年\d{1,2}月' -and $shelfDate -notmatch '^\d{4}年\d{1,2}月') {
                $temp = $shelfDate
                $shelfDate = $saleType
                $saleType = $temp
            }
        } elseif ($cat6Items.ContainsKey($code)) {
            $subcat = if ($code.StartsWith("6-1")) { "堅果罐 6-1" }
                      elseif ($code.StartsWith("6-2")) { "堅果禮盒 6-2" }
                      elseif ($code.StartsWith("6-3")) { "堅果飲禮盒 6-3" }
                      elseif ($code.StartsWith("6-4")) { "海苔禮盒 6-4" }
                      else { "年節禮盒 6" }
            $barcode = [string]$cat6Items[$code].Barcode
            $saleType = "禮盒/年節"
        }

        # 回退至既有資料庫 (確保促銷品 7-1 等條碼與貨號完整保留)
        $relImagePath = "$($cat.dir)/$filename"
        if ((-not $barcode -or -not $pxCode) -and ($existingDataMap.ContainsKey($code) -or $existingDataMap.ContainsKey($relImagePath))) {
            $prevItem = if ($code -and $existingDataMap.ContainsKey($code)) { $existingDataMap[$code] } else { $existingDataMap[$relImagePath] }
            if (-not $code -and $prevItem.code) { $code = $prevItem.code }
            if (-not $pxCode -and $prevItem.pxCode) { $pxCode = $prevItem.pxCode }
            if (-not $barcode -and $prevItem.barcode) { $barcode = $prevItem.barcode }
            if (-not $subcat -and $prevItem.subcategory) { $subcat = $prevItem.subcategory }
            if (-not $shelfDate -and $prevItem.shelfDate) { $shelfDate = $prevItem.shelfDate }
            if (-not $saleType -and $prevItem.saleType) { $saleType = $prevItem.saleType }
        }

        $idx++
        $allProducts += [PSCustomObject]@{
            id = $idx
            code = $code
            name = $name
            category = $cat.dir
            categoryName = $cat.name
            categoryId = $cat.id
            categoryColor = $cat.color
            subcategory = $subcat
            pxCode = $pxCode
            barcode = $barcode
            image = $relImagePath
            shelfDate = $shelfDate
            saleType = $saleType
        }
    }
}

$jsonNoBOM = New-Object System.Text.UTF8Encoding($false)
$json = $allProducts | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $workspace "products_data.json"), $json, $jsonNoBOM)

$categoriesJson = $categoriesMeta | ConvertTo-Json -Depth 5
$jsContent = @"
// 全聯福利中心 條碼查詢系統 - 2026年10月資料庫
const APP_CONFIG = {
    version: "2026.10",
    updateDate: "2026年10月10日",
    title: "全聯福利中心 條碼快速查詢系統",
    subtitle: "PX MART Barcode Lookup System"
};

const CATEGORIES_DATA = $categoriesJson;

const PRODUCTS_DATA = $json;

// 舊版相容資料結構
const IMAGE_DATA = {};
PRODUCTS_DATA.forEach(p => {
    if (!IMAGE_DATA[p.category]) {
        IMAGE_DATA[p.category] = [];
    }
    const filename = p.image.substring(p.image.indexOf('/') + 1);
    IMAGE_DATA[p.category].push(filename);
});
"@

[System.IO.File]::WriteAllText((Join-Path $workspace "products_data.js"), $jsContent, $jsonNoBOM)
[System.IO.File]::WriteAllText((Join-Path $workspace "products.js"), $jsContent, $jsonNoBOM)

Write-Host "成功產生 $($allProducts.Count) 款商品條碼資料庫！" -ForegroundColor Green
